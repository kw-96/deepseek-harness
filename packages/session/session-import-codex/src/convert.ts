/**
 * Convert one assembled Codex thread into contiguous DSH session events.
 * Pure over its inputs: no I/O, no services. The mapping records Codex
 * messages and tool traffic in the DSH vocabulary so the imported session
 * replays through the standard transcript, title, and list projections.
 * @module @deepseek-ai/dsh-session-import-codex/convert
 */

import type {} from '@deepseek-ai/dsh-session-title'
import type {
  MessageId,
  ToolCallId,
  ToolResultMessage,
} from '@deepseek-ai/dsh-llm'
import { brandString } from '@deepseek-ai/dsh-brand'
import {
  SessionSeq,
  type SessionEvent,
  type SessionEventMap,
  type SessionEventType,
} from '@deepseek-ai/dsh-session/types'
import type {
  CodexThreadItem,
  CodexThreadRecord,
  CodexThreadTurn,
  ConvertedCodexThread,
  ImportBounds,
} from './types.ts'

/** Tool vocabulary names used for Codex items with no direct DSH counterpart. */
const TOOL_NAMES = {
  command: 'Bash',
  fileChange: 'codex.fileChange',
  imageView: 'codex.imageView',
  webSearch: 'web_search',
} as const

/** Model provenance stamped on imported assistant messages. */
const CODEX_PROVENANCE = { provider: 'codex', model: 'codex' } as const

/** One emit-able conversion step: the turn being built, its emitted-item count, and the running step. */
interface TurnState {
  /** 1-based DSH turn number across the whole session. */
  readonly turn: number
  /** DSH step counter inside this turn; starts at 1, advances per assistant message. */
  step: number
  /** Whether the `turn/start` boundary is already in the event list. */
  started: boolean
}

/** Narrow an unknown JSON value to a plain record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Narrow an unknown JSON value to a non-empty string. */
function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Join the `text` fields of Codex content blocks (`input_text`-shaped arrays). */
function joinTextBlocks(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    const record = asRecord(block)
    if (record === undefined || record['type'] !== 'text') continue
    const text = asNonEmptyString(record['text'])
    if (text !== undefined) parts.push(text)
  }
  return parts.join('\n')
}

/** Extract the display titles (or urls) of web-search result entries. */
function webResultTitles(results: unknown): string[] {
  if (!Array.isArray(results)) return []
  const titles: string[] = []
  for (const entry of results) {
    const record = asRecord(entry)
    if (record === undefined) continue
    const title = asNonEmptyString(record['title']) ?? asNonEmptyString(record['url'])
    if (title !== undefined) titles.push(title)
  }
  return titles
}

/** Extract changed paths and change kinds from a `fileChange` item. */
function changedFiles(json: Record<string, unknown>): { paths: string[]; kinds: string[] } {
  const changes = json['changes']
  if (!Array.isArray(changes)) return { paths: [], kinds: [] }
  const paths: string[] = []
  const kinds: string[] = []
  for (const change of changes) {
    const record = asRecord(change)
    if (record === undefined) continue
    const path = asNonEmptyString(record['path'])
    if (path !== undefined) paths.push(path)
    const kind = asRecord(record['kind'])
    const kindType = kind === undefined ? undefined : asNonEmptyString(kind['type'])
    if (kindType !== undefined) kinds.push(kindType)
  }
  return { paths, kinds }
}

/** Cap imported display text to the configured bound, preserving complete code units. */
function cap(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum)
}

/** Normalize a Codex thread title for the `session/title` event. */
function normalizeTitle(title: string | undefined, maximum: number): string | undefined {
  if (title === undefined) return undefined
  const normalized = cap(title.trim().replace(/\s+/g, ' '), maximum)
  return normalized.length === 0 ? undefined : normalized
}

/**
 * Push one event with the running seq and a monotonically non-decreasing time.
 * Surface events carry the mandatory `append` marker; log-only events carry none.
 * @param events - mutable event list being built.
 * @param state - shared seq/time cursor.
 * @param type - DSH event type.
 * @param time - desired Unix epoch milliseconds; clamped to the previous event's time.
 * @param data - typed payload.
 * @param surface - whether the event joins the ordered surface.
 */
function push<K extends SessionEventType>(
  events: SessionEvent[],
  state: { seq: number; prevTime: number },
  type: K,
  time: number,
  data: SessionEventMap[K],
  surface?: 'append',
): void {
  const stamped = Math.max(state.prevTime, time)
  state.prevTime = stamped
  events.push({
    type,
    seq: SessionSeq(state.seq),
    time: stamped,
    data,
    ...(surface === undefined ? {} : { surfaceOp: surface }),
  } as SessionEvent)
  state.seq += 1
}

/** Emit one Codex tool item as a paired `tool/call` + `tool/result`. */
function pushToolPair(
  events: SessionEvent[],
  state: { seq: number; prevTime: number },
  item: CodexThreadItem,
  turn: TurnState,
  name: string,
  argumentRecord: Record<string, unknown>,
  resultText: string,
  isError: boolean,
  bounds: ImportBounds,
): void {
  const callId = brandString<ToolCallId>(item.itemId)
  const argumentsText = JSON.stringify(argumentRecord)
  push(events, state, 'tool/call', item.createdAtMs, {
    turn: turn.turn,
    step: turn.step,
    callId,
    name,
    arguments: argumentsText,
  })
  const message: ToolResultMessage = {
    id: brandString<MessageId>(item.itemId),
    role: 'user',
    content: [{
      type: 'tool-result',
      toolCallId: callId,
      content: [{ type: 'text', text: cap(resultText, bounds.maxToolResultChars) }],
      isError,
    }],
    source: { kind: 'tool', callId },
  }
  push(events, state, 'tool/result', item.createdAtMs, {
    turn: turn.turn,
    step: turn.step,
    message,
  }, 'append')
}

/** Emit the Codex tool item when its item type maps to a DSH tool record. */
function pushToolItem(
  events: SessionEvent[],
  state: { seq: number; prevTime: number },
  item: CodexThreadItem,
  turn: TurnState,
  bounds: ImportBounds,
): void {
  const json = item.json
  switch (item.itemType) {
    case 'commandExecution': {
      const cwd = asNonEmptyString(json['cwd'])
      const command = asNonEmptyString(json['command']) ?? ''
      const output = asNonEmptyString(json['aggregatedOutput']) ?? ''
      pushToolPair(events, state, item, turn, TOOL_NAMES.command,
        { command, ...cwd === undefined ? {} : { cwd } },
        output, json['status'] !== 'completed', bounds)
      return
    }
    case 'mcpToolCall': {
      const server = asNonEmptyString(json['server']) ?? ''
      const tool = asNonEmptyString(json['tool']) ?? ''
      const argumentRecord = asRecord(json['arguments']) ?? {}
      const resultRecord = asRecord(json['result'])
      const resultText = joinTextBlocks(resultRecord === undefined ? undefined : resultRecord['content'])
      pushToolPair(events, state, item, turn, `mcp.${server}.${tool}`,
        argumentRecord, resultText, json['status'] !== 'completed', bounds)
      return
    }
    case 'webSearch': {
      const query = asNonEmptyString(json['query']) ?? ''
      const text = webResultTitles(json['results']).join('\n')
      pushToolPair(events, state, item, turn, TOOL_NAMES.webSearch,
        { query }, text, false, bounds)
      return
    }
    case 'fileChange': {
      const { paths, kinds } = changedFiles(json)
      const text = `changed ${paths.length} file(s): ${paths.join(', ')}`
      pushToolPair(events, state, item, turn, TOOL_NAMES.fileChange,
        { paths, kinds }, text, false, bounds)
      return
    }
    case 'imageView': {
      const path = asNonEmptyString(json['path']) ?? ''
      pushToolPair(events, state, item, turn, TOOL_NAMES.imageView,
        { path }, '', false, bounds)
      return
    }
  }
}

/** First-seen item time for a turn lacking explicit boundaries. */
function firstItemTime(items: readonly CodexThreadItem[]): number {
  return items.reduce((earliest, item) => Math.min(earliest, item.createdAtMs), Number.MAX_SAFE_INTEGER)
}

/** Sort one thread's turn groups chronologically and pair each with its items. */
function orderedTurnGroups(record: CodexThreadRecord): { turn: CodexThreadTurn | undefined; items: CodexThreadItem[] }[] {
  const byTurn = new Map<string, CodexThreadItem[]>()
  for (const item of record.items) {
    const group = byTurn.get(item.turnId)
    if (group === undefined) byTurn.set(item.turnId, [item])
    else group.push(item)
  }
  const turnsById = new Map(record.turns.map(turn => [turn.turnId, turn]))
  return [...byTurn.entries()]
    .map(([turnId, items]) => ({ turn: turnsById.get(turnId), items }))
    .sort((left, right) => {
      const leftStart = left.turn?.startedAtMs ?? firstItemTime(left.items)
      const rightStart = right.turn?.startedAtMs ?? firstItemTime(right.items)
      return leftStart - rightStart
    })
}

/** Most common absolute `cwd` across command items, else the fallback. */
function deriveCwd(record: CodexThreadRecord, fallbackCwd: string): string {
  const counts = new Map<string, number>()
  for (const item of record.items) {
    if (item.itemType !== 'commandExecution' && item.itemType !== 'mcpToolCall') continue
    const cwd = asNonEmptyString(item.json['cwd'])
    if (cwd === undefined) continue
    counts.set(cwd, (counts.get(cwd) ?? 0) + 1)
  }
  let best: string | undefined
  let bestCount = 0
  for (const [cwd, count] of counts) {
    if (count > bestCount) {
      best = cwd
      bestCount = count
    }
  }
  return best ?? fallbackCwd
}

/**
 * Convert one Codex thread into its DSH event log.
 * @param record - assembled Codex thread (items, turns, optional title).
 * @param fallbackCwd - absolute cwd recorded when Codex carried none.
 * @param bounds - title and tool-result caps.
 * @returns contiguous events plus the header cwd, or an empty event list for an empty thread.
 */
export function convertCodexThread(
  record: CodexThreadRecord,
  fallbackCwd: string,
  bounds: ImportBounds,
): ConvertedCodexThread {
  const events: SessionEvent[] = []
  const state = { seq: 0, prevTime: 0 }
  let firstUserSeq: SessionSeq | undefined
  const groups = orderedTurnGroups(record)
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index] as { turn: CodexThreadTurn | undefined; items: CodexThreadItem[] }
    const turnState: TurnState = { turn: index + 1, step: 1, started: false }
    for (const item of group.items) {
      switch (item.itemType) {
        case 'userMessage': {
          const text = joinTextBlocks(item.json['content'])
          if (text.trim().length === 0) break
          if (!turnState.started) {
            push(events, state, 'turn/start', group.turn?.startedAtMs ?? item.createdAtMs, { turn: turnState.turn })
            turnState.started = true
          }
          push(events, state, 'user/message', item.createdAtMs, {
            id: brandString<MessageId>(item.itemId),
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: 'user' },
          }, 'append')
          if (firstUserSeq === undefined) {
            firstUserSeq = SessionSeq(events.length - 1)
            const title = normalizeTitle(record.title, bounds.maxTitleChars)
            if (title !== undefined) {
              push(events, state, 'session/title', item.createdAtMs, {
                title,
                messageSeqs: [firstUserSeq],
                source: { kind: 'fallback' },
              })
            }
          }
          break
        }
        case 'agentMessage': {
          const text = asNonEmptyString(item.json['text'])
          if (text === undefined) break
          if (!turnState.started) {
            push(events, state, 'turn/start', group.turn?.startedAtMs ?? item.createdAtMs, { turn: turnState.turn })
            turnState.started = true
          }
          push(events, state, 'assistant/message', item.createdAtMs, {
            turn: turnState.turn,
            step: turnState.step,
            message: {
              id: brandString<MessageId>(item.itemId),
              role: 'assistant',
              content: [{ type: 'text', text }],
              source: { kind: 'model', ...CODEX_PROVENANCE },
            },
          }, 'append')
          turnState.step += 1
          break
        }
        case 'commandExecution':
        case 'mcpToolCall':
        case 'webSearch':
        case 'fileChange':
        case 'imageView': {
          if (!turnState.started) {
            push(events, state, 'turn/start', group.turn?.startedAtMs ?? item.createdAtMs, { turn: turnState.turn })
            turnState.started = true
          }
          pushToolItem(events, state, item, turnState, bounds)
          break
        }
        default:
          // `reasoning`, `contextCompaction`, and unknown types are not transcript material.
          break
      }
    }
    if (turnState.started) {
      // Groups are built from items, so the last item always exists.
      // oxlint-disable-next-line typescript/no-non-null-assertion
      const lastTime = group.items[group.items.length - 1]!.createdAtMs
      const completed = group.turn?.status === 'completed'
      push(events, state, 'turn/end', group.turn?.completedAtMs ?? lastTime, {
        turn: turnState.turn,
        reason: completed
          ? { kind: 'completed' }
          : { kind: 'aborted', reason: { kind: 'legacy' } },
      })
    }
  }
  if (events.length > 0) {
    push(events, state, 'session/end-seed', state.prevTime, {})
  }
  return {
    events,
    cwd: deriveCwd(record, fallbackCwd),
  }
}
