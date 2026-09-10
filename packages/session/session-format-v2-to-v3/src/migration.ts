/** Streaming system-prompt promotion followed by canonical V3 envelope conversion. */

import { createHash } from 'node:crypto'
import { SessionFormatError, SessionFormatUnsupportedMigrationError, defineSessionFormatMigration, sessionFormatCount } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatEvent, SessionFormatEventRun, SessionFormatJsonObject, SessionFormatJsonValue, SessionFormatMigrationContext, SessionFormatMigrationStage, SessionFormatMigrationStageInput } from '@deepseek-ai/dsh-session-format'
import { assertReleasedV2Header } from '@deepseek-ai/dsh-session-format-v1-to-v2'
import { assertEvent, canonicalizeTransformedEvent, record, SURFACE_TYPES } from './payload.ts'
import { remapEvent } from './references.ts'
import { assertReleasedV3Header } from './validation.ts'

/** Promote system prompts, remap audited references, and canonicalize envelopes and PTC vocabulary. */
export const sessionFormatV2ToV3 = defineSessionFormatMigration({
  name: '@deepseek-ai/dsh-session-format-v2-to-v3',
  fromVersion: 2,
  toVersion: 3,
  migrateHeader(header) {
    assertReleasedV2Header(header)
    return { ...header, version: 3, ...(header.agentPreset === 'code' ? { agentPreset: 'ptc' } : {}) }
  },
  createStage(input) { return new ReleasedV2ToV3Stage(input) },
  validateTargetHeader: assertReleasedV3Header,
})

/** 携带 turn/step 坐标、需要开放 step 的事件类型（本地 step 复原用）。 */
const STEP_EVENT_TYPES = new Set(['assistant/message', 'assistant/attempt', 'tool/call', 'tool/result', 'system/message'])

class ReleasedV2ToV3Stage implements SessionFormatMigrationStage {
  readonly headerInheritedEventCount?: number
  private readonly mapping: number[] = []
  private readonly originalIds = new Set<string>()
  private readonly generatedIds = new Set<string>()
  private targetSeq = 0
  private sourceCut: number | undefined
  private targetCut: number | undefined
  private lastForeignDeliverySeq: number | undefined
  private step: { turn: number; step: number } | undefined
  private turn = 1
  private nextStep = 1
  private head: number | undefined
  private prompt = ''

  constructor(private readonly input: SessionFormatMigrationStageInput) {
    assertReleasedV2Header(input.sourceHeader)
    this.sourceCut = input.sourceHeader.isSeeded ? undefined : 0
    this.targetCut = input.sourceHeader.isSeeded ? undefined : 0
    if (!input.sourceHeader.isSeeded) this.headerInheritedEventCount = 0
  }

  transformEvent(event: SessionFormatEvent, context: SessionFormatMigrationContext): void {
    if (event.seq !== this.mapping.length) throw new SessionFormatError('format v2 source events must be dense')
    assertEvent(event, 2)
    this.observeMessageIds(event)
    let source = event
    let data = record(event.data, event.type)
    if (event.type === 'turn/start') {
      this.turn = data['turn'] as number
      this.nextStep = 1
    }
    if (event.type === 'request/header') {
      const { system, ...header } = record(data['header'], 'request header')
      const prompt = typeof system === 'string' ? system : ''
      if (prompt !== this.prompt) this.emitSystem(prompt, event, context)
      source = { ...event, data: { ...data, header } }
    }
    // 本地定制(dev fork)：旧 Codex 导入会话没有 step/start、step/end 与
    // system 头，且可能携带过期 turn 坐标。官方在此拒绝整段会话；为让存量
    // 会话可迁移，按事件坐标确定性复原 step 边界并钳制过期坐标。
    const restored = this.restoreLegacyStep(event, data, context)
    if (restored.changed) {
      source = restored.source
      data = restored.data
    }
    if (SURFACE_TYPES.has(event.type) && this.head === undefined) {
      if (this.step === undefined) {
        // 用户消息等无 step 坐标的 surface：在空 system 头前先开一个
        // 确定性 step（当前轮次、step 1），满足 system/message 的坐标要求。
        this.step = { turn: this.turn, step: 1 }
        this.nextStep = 2
        context.emitEvent(canonicalizeTransformedEvent({
          type: 'step/start', seq: this.targetSeq++, time: event.time,
          data: { turn: this.turn, step: 1 },
        }))
      }
      this.emitSystem('', event, context)
    }
    if (event.type === 'session/end-seed' && data['inherited'] === true) {
      if (!this.input.sourceHeader.isSeeded) throw new SessionFormatError('format v2 unseeded Session contains an inherited end-seed marker')
      this.sourceCut = event.seq
      this.targetCut = this.targetSeq
    }
    if (event.type === 'session-log-deepseek/delivery-accepted') {
      if (data['sessionFormatVersion'] === 3) throw new SessionFormatError('format v2 delivery marker claims target format v3')
      if (data['sessionFormatVersion'] === 2 && data['sessionId'] !== this.input.sourceHeader.id) this.lastForeignDeliverySeq = event.seq
    }
    // 本地定制(dev fork)：旧 Codex 导入会话没有 step/end；在轮次收尾事件
    // 发出之前闭合复原出的 step，保证 v3 不变式（turn/end 不得跨越开放 step）。
    if (event.type === 'turn/end' && this.step !== undefined) {
      const step = this.step
      this.step = undefined
      context.emitEvent(canonicalizeTransformedEvent({
        type: 'step/end', seq: this.targetSeq++, time: event.time,
        data: { turn: step.turn, step: step.step },
      }))
    }
    // 本地定制(dev fork)：合成 step 与随后到达的真实 step/start 撞车时，
    // 先闭合合成 step，再照常处理真实事件，保持目标流稠密且边界合法。
    if (event.type === 'step/start' && this.step !== undefined) {
      const turn = data['turn'] as number
      const step = data['step'] as number
      if (this.step.turn === turn && this.step.step === step) {
        const closed = this.step
        this.step = undefined
        context.emitEvent(canonicalizeTransformedEvent({
          type: 'step/end', seq: this.targetSeq++, time: event.time,
          data: { turn: closed.turn, step: closed.step },
        }))
      }
    }
    const target = remapEvent(source, this.targetSeq, this.mapping)
    this.mapping.push(this.targetSeq++)
    context.emitEvent(canonicalizeTransformedEvent(renamePtcEvent(target)))
    if (event.type === 'step/start') {
      this.step = { turn: data['turn'] as number, step: data['step'] as number }
      this.nextStep = this.step.step + 1
      if (this.head === undefined) this.emitSystem('', event, context)
    } else if (event.type === 'step/end') {
      this.step = undefined
    }
  }

  /**
   * 本地定制(dev fork)：按 step 坐标事件自带的 turn/step 复原旧导入会话
   * 缺失的 step/start 与 step/end 边界；过期 turn 坐标钳制到当前开放 step。
   * 规范 v2 输入自带完整边界与正确坐标，此方法对它们是无操作。
   */
  private restoreLegacyStep(
    event: SessionFormatEvent,
    input: SessionFormatJsonObject,
    context: SessionFormatMigrationContext,
  ): { changed: boolean; source: SessionFormatEvent; data: SessionFormatJsonObject } {
    // 仅追加类 step 坐标事件需要开放 step；replacement 事件只需要开放 turn，
    // 由 v3 校验自行处理，不在此合成边界（旧数据里过期坐标的 replacement
    // 正是如此，合成反而会破坏 step 编号）。
    if (!STEP_EVENT_TYPES.has(event.type)) return { changed: false, source: event, data: input }
    if (event['surfaceOp'] !== undefined && event['surfaceOp'] !== 'append') {
      return { changed: false, source: event, data: input }
    }
    let turn = input['turn'] as number
    let step = input['step'] as number
    let data = input
    let source = event
    if (turn !== this.turn) {
      // 旧数据携带过期 turn 坐标：并入当前开放 step；无开放 step 时按
      // 当前轮次的下一个 step 编号开 step（诚实修复，而非拒绝整个会话）。
      const clamped = this.step ?? { turn: this.turn, step: this.nextStep }
      turn = clamped.turn
      step = clamped.step
      data = { ...input, turn, step }
      source = { ...event, data }
    }
    if (this.step !== undefined && (this.step.turn !== turn || this.step.step !== step)) {
      const closed = this.step
      this.step = undefined
      context.emitEvent(canonicalizeTransformedEvent({
        type: 'step/end', seq: this.targetSeq++, time: event.time,
        data: { turn: closed.turn, step: closed.step },
      }))
    }
    if (this.step === undefined) {
      this.step = { turn, step }
      this.nextStep = step + 1
      context.emitEvent(canonicalizeTransformedEvent({
        type: 'step/start', seq: this.targetSeq++, time: event.time,
        data: { turn, step },
      }))
    }
    return { changed: turn !== (input['turn'] as number), source, data }
  }

  transformRun(run: SessionFormatEventRun, context: SessionFormatMigrationContext): void {
    for (const event of run.expand()) this.transformEvent(event, context)
  }

  finish(_context: SessionFormatMigrationContext): number {
    const cut = sessionFormatCount(this.sourceCut, 'format v2 inherited end-seed marker')
    if (this.input.sourceInheritedEventCount !== undefined && this.input.sourceInheritedEventCount !== cut) {
      throw new SessionFormatError('format v2 inherited end-seed marker disagrees with its source cut')
    }
    if (this.lastForeignDeliverySeq !== undefined
      && (this.input.sourceHeader.parentSession === undefined || this.lastForeignDeliverySeq >= cut)) {
      throw new SessionFormatError('current-generation delivery marker names the wrong Session')
    }
    return sessionFormatCount(this.targetCut, 'format v3 inherited event count')
  }

  private observeMessageIds(event: SessionFormatEvent): void {
    const data = record(event.data, event.type)
    const messages = event.type === 'user/message' ? [data]
      : event.type === 'assistant/message' || event.type === 'tool/result' ? [record(data['message'], 'message')]
        : event.type === 'agent/inbox/spliced' ? data['inserted']
          : event.type === 'session/title-llm-request' ? data['messages'] : []
    // assertEvent validates every owned message before identity observation.
    for (const message of messages as readonly SessionFormatJsonObject[]) {
      const id = message['id'] as string
      if (this.generatedIds.has(id)) throw new SessionFormatUnsupportedMigrationError('source message id collides with a generated system message id')
      this.originalIds.add(id)
    }
  }

  private emitSystem(prompt: string, anchor: SessionFormatEvent, context: SessionFormatMigrationContext): void {
    if (this.step === undefined) {
      throw new SessionFormatUnsupportedMigrationError('format v2 changed request prompt outside an open step cannot retain source chronology')
    }
    const identity = JSON.stringify(['session-format-v2-to-v3', this.input.sourceHeader.id, anchor.seq, anchor.type])
    const id = 'v2-to-v3-system-' + createHash('sha256').update(identity).digest('hex')
    if (this.originalIds.has(id) || this.generatedIds.has(id)) {
      throw new SessionFormatUnsupportedMigrationError('generated system message id collides with an existing message id')
    }
    this.generatedIds.add(id)
    const seq = this.targetSeq++
    context.emitEvent(canonicalizeTransformedEvent({
      type: 'system/message', seq, time: anchor.time,
      data: {
        ...this.step,
        message: {
          id,
          role: 'system', source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' },
          content: prompt === '' ? [] : [{ type: 'text', text: prompt }],
        },
      },
      ...(this.head === undefined
        ? { surfaceOp: 'append' }
        : { surfaceOp: { op: 'replace', start: this.head, end: this.head }, sourceEventSeqs: [this.head] }),
    }))
    this.head = seq
    this.prompt = prompt
  }
}

/** Source admission precedes renaming, so these payloads have exact audited fields. */
function renamePtcEvent(event: SessionFormatEvent): SessionFormatEvent {
  switch (event.type) {
    case 'agent-preset/selected':
      return (event.data as SessionFormatJsonObject)['agentPreset'] === 'code'
        ? { ...event, data: { ...event.data as SessionFormatJsonObject, agentPreset: 'ptc' } } : event
    case 'tool/code-dispatch-start':
      return { ...event, type: 'tool/ptc-dispatch-start' }
    case 'tool/code-dispatch':
      return { ...event, type: 'tool/ptc-dispatch' }
    case 'user/message': {
      const data = renameMessageSource(event.data as SessionFormatJsonObject)
      return data === event.data ? event : { ...event, data }
    }
    case 'agent/inbox/spliced':
    case 'session/title-llm-request': {
      const data = event.data as SessionFormatJsonObject
      const key = event.type === 'agent/inbox/spliced' ? 'inserted' : 'messages'
      const messages = data[key] as readonly SessionFormatJsonObject[]
      const renamed = messages.map(renameMessageSource)
      return renamed.every((message, index) => message === messages[index])
        ? event
        : { ...event, data: { ...data, [key]: renamed } }
    }
    default:
      // Content, tool arguments, message IDs, and other payloads are not plugin attribution slots.
      return event
  }
}

function renameMessageSource(message: SessionFormatJsonObject): SessionFormatJsonValue {
  const source = message['source'] as SessionFormatJsonObject
  if (source['kind'] !== 'plugin' || source['plugin'] !== 'tools-code-mode') return message
  return { ...message, source: { ...source, plugin: 'tools-ptc' } }
}
