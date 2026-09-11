/**
 * 交互类工具：点击、填写、按键与下拉选择。写操作前会自动补齐失效的
 * 引用；选择器写法与引用写法都支持，引用优先。
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ackRender, observationRender, observationSchema, observationValue } from './observation.js'
import type { BrowserToolDeps } from './shared.js'
import {
  durationArg, refreshRefs, registerTool, requireSessionId, runFor, takeSnapshot, textBlock, valueSchema,
} from './shared.js'

/** 形如 `@e3` / `e3` 的引用写法。 */
const REF_PATTERN = /^@?e\d+$/
/** 可能触发导航或提交的按键。 */
const NAVIGATING_KEY = /^(enter|numpadenter|space|\w+\+(enter|space))$/i

/** 回执输出 schema。 */
const ackSchema = valueSchema({
  type: 'object',
  additionalProperties: false,
  properties: {
    message: { type: 'string', required: true },
    refsValid: { type: 'boolean', required: true },
  },
})

/**
 * 判断目标是引用还是 CSS 选择器。
 * @param target - 模型给出的目标
 * @returns 目标是否为快照引用
 */
export function isRef(target: string): boolean {
  return REF_PATTERN.test(target.trim())
}

/**
 * 注册 browser_click / browser_fill / browser_press / browser_select。
 * @param ctx - 宿主上下文（提供 tools 注册表）
 * @param deps - 工具依赖
 */
export function registerInteractTools(ctx: Context, deps: BrowserToolDeps): void {
  registerTool(ctx, defineTool({
    name: 'browser_click',
    description:
      'Click an element. Prefer an @eN ref from the most recent snapshot; a CSS selector also works. '
      + 'If the refs are stale the plugin re-snapshots first, and it always returns a fresh snapshot '
      + 'afterwards because the DOM or URL may have changed.',
    parameters: {
      target: { type: 'string', required: true, description: 'Snapshot ref (@eN) or CSS selector.' },
      button: { type: 'string', enum: ['left', 'middle', 'right'], description: 'Mouse button (default left).' },
      clickCount: { type: 'integer', description: 'Consecutive presses; 2 double-clicks.' },
      modifiers: { type: 'string', description: 'Comma-separated modifiers (alt,ctrl,shift,meta).' },
    },
    output: { schema: observationSchema, render: (_args, value) => observationRender(value) },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      const refreshed = await refreshRefs(deps, sessionId, exec.signal)
      const command = ['click', args.target, '--json', '--timeout', durationArg(deps.config.actionTimeoutMs)]
      if (args.button !== undefined) command.push('--button', args.button)
      if (args.clickCount !== undefined) command.push('--click-count', String(args.clickCount))
      if (args.modifiers !== undefined) command.push('--modifiers', args.modifiers)
      await runFor(deps, sessionId, command, { signal: exec.signal })
      deps.store.markRefsStale(sessionId)
      const captured = await takeSnapshot(deps, sessionId, exec.signal)
      const prefix = refreshed === null ? '' : '点击前引用已失效，已自动补拍快照；'
      return observationValue(captured.record, captured.snapshot, `${prefix}点击后已重新快照`)
    },
    presentCall: args => ({ card: 'generic', title: `点击 ${args.target}`, kind: 'other', rawInput: args.target }),
  }))

  registerTool(ctx, defineTool({
    name: 'browser_fill',
    description:
      'Clear and type text into an input, textarea, or contenteditable element. Prefer an @eN ref from the '
      + 'most recent snapshot. Element refs stay valid after filling, so no snapshot is returned.',
    parameters: {
      target: { type: 'string', required: true, description: 'Snapshot ref (@eN) or CSS selector.' },
      value: { type: 'string', required: true, description: 'Text to type.' },
      clear: { type: 'boolean', description: 'Wipe the field first (default true).' },
    },
    output: { schema: ackSchema, render: (_args, value) => ackRender(value) },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      await refreshRefs(deps, sessionId, exec.signal)
      const command = ['fill', args.target, '--value', args.value, '--json', '--timeout', durationArg(deps.config.actionTimeoutMs)]
      if (args.clear === false) command.push('--no-clear')
      await runFor(deps, sessionId, command, { signal: exec.signal })
      return { message: `已填写 ${args.target}`, refsValid: true }
    },
    presentCall: args => ({ card: 'generic', title: `填写 ${args.target}`, kind: 'other', rawInput: args.value }),
  }))

  registerTool(ctx, defineTool({
    name: 'browser_press',
    description:
      'Dispatch a keyboard key or combo (Enter, Tab, Escape, Ctrl+A, ArrowDown). Optionally focus an element '
      + 'first with a ref or selector. When the key can submit or navigate, a fresh snapshot is returned.',
    parameters: {
      key: { type: 'string', required: true, description: 'Key spec, e.g. Enter, Ctrl+A, ArrowLeft.' },
      target: { type: 'string', description: 'Optional ref or selector to focus first.' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          message: { type: 'string' as const, required: true },
          refsValid: { type: 'boolean' as const, required: true },
          url: { type: 'string' as const, required: true },
          title: { type: 'string' as const, required: true },
          bskSessionId: { type: 'string' as const, required: true },
          refs: { type: 'integer' as const, required: true },
          truncated: { type: 'boolean' as const, required: true },
          note: { type: 'string' as const, required: true },
          snapshot: { type: 'string' as const, required: true },
        },
      },
      render: (_args, value) => {
        const seen = value as { refsValid: boolean; message: string; snapshot: string }
        return seen.refsValid ? textBlock(seen.message) : observationRender(value)
      },
    },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      await refreshRefs(deps, sessionId, exec.signal)
      const command = ['press', args.key, '--json', '--timeout', durationArg(deps.config.actionTimeoutMs)]
      if (args.target !== undefined) {
        command.push(isRef(args.target) ? '--ref' : '--selector', args.target)
      }
      await runFor(deps, sessionId, command, { signal: exec.signal })
      const message = `已发送按键 ${args.key}${args.target === undefined ? '' : `（聚焦 ${args.target}）`}`
      if (!NAVIGATING_KEY.test(args.key.trim())) {
        return { message: `${message}；引用仍然有效`, refsValid: true, url: '', title: '', bskSessionId: '', refs: 0, truncated: false, note: '', snapshot: '' }
      }
      deps.store.markRefsStale(sessionId)
      const captured = await takeSnapshot(deps, sessionId, exec.signal)
      return { message, refsValid: false, ...observationValue(captured.record, captured.snapshot, `${args.key} 可能已触发提交或导航，快照已刷新`) }
    },
    presentCall: args => ({ card: 'generic', title: `按键 ${args.key}`, kind: 'other', rawInput: args.key }),
  }))

  registerTool(ctx, defineTool({
    name: 'browser_select',
    description: 'Set the value(s) of a <select> element. Repeat `values` for a multi-select.',
    parameters: {
      target: { type: 'string', required: true, description: 'Snapshot ref (@eN) or CSS selector.' },
      values: { type: 'array', required: true, items: { type: 'string', description: 'Option value to select.' }, description: 'Option values to select.' },
    },
    output: { schema: ackSchema, render: (_args, value) => ackRender(value) },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      await refreshRefs(deps, sessionId, exec.signal)
      const command = ['select', args.target, '--json', '--timeout', durationArg(deps.config.actionTimeoutMs)]
      for (const value of args.values) command.push('--value', value)
      await runFor(deps, sessionId, command, { signal: exec.signal })
      return { message: `已选择 ${args.values.join(', ')}`, refsValid: true }
    },
    presentCall: args => ({ card: 'generic', title: `选择 ${args.values.join(', ')}`, kind: 'other', rawInput: args.values }),
  }))
}
