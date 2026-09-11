/**
 * 观测类工具：打开页面与按需升级的观测方式。快照始终是默认路径，
 * HTML 与截图只在快照无法回答问题时使用。
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { captureScreenshot, observationRender, observationSchema, observationValue } from './observation.js'
import type { BrowserToolDeps } from './shared.js'
import {
  durationArg, navigationTimeout, recordNavigation, registerTool, requireSessionId, runFor, takeSnapshot, textBlock, valueSchema,
} from './shared.js'

/** 观测模式。 */
const OBSERVE_MODES = ['snapshot', 'html', 'screenshot'] as const
/** 等待条件取值。 */
const WAIT_UNTIL = ['load', 'domcontentloaded', 'networkidle', 'commit'] as const

const observeSchema = valueSchema({
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: { type: 'string', required: true, enum: [...OBSERVE_MODES] },
    url: { type: 'string', required: true },
    title: { type: 'string', required: true },
    bskSessionId: { type: 'string', required: true },
    refs: { type: 'integer', required: true },
    truncated: { type: 'boolean', required: true },
    note: { type: 'string', required: true },
    content: { type: 'string', required: true },
    screenshotPath: { type: 'string', required: true },
    screenshotBytes: { type: 'integer', required: true },
    screenshotSize: { type: 'string', required: true },
  },
})

/**
 * 注册 browser_open 与 browser_observe。
 * @param ctx - 宿主上下文（提供 tools 注册表）
 * @param deps - 工具依赖
 */
export function registerObserveTools(ctx: Context, deps: BrowserToolDeps): void {
  registerTool(ctx, defineTool({
    name: 'browser_open',
    description:
      'Open a URL in the browser automation window (an isolated Agent Window; the user\'s own '
      + 'windows are untouched) and return the page\'s accessibility snapshot with @eN element refs. '
      + 'Every earlier ref becomes invalid after this call — use only refs from the returned snapshot.',
    parameters: {
      url: { type: 'string', required: true, description: 'Absolute URL to open.' },
      newTab: { type: 'boolean', description: 'Open in a new tab of the Agent Window instead of reusing the active tab.' },
      waitUntil: { type: 'string', enum: [...WAIT_UNTIL], description: 'Lifecycle phase to wait for (default `load`).' },
    },
    output: {
      schema: observationSchema,
      render: (_args, value) => observationRender(value),
    },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      deps.policy.assertNavigable(args.url)
      const waitUntil = args.waitUntil ?? 'load'
      const timeout = durationArg(navigationTimeout(deps))
      let note = ''
      if (args.newTab === true) {
        await runFor(deps, sessionId, ['tab', 'create', '--url', args.url, '--json'], {
          timeoutMs: navigationTimeout(deps), signal: exec.signal,
        })
        deps.store.markRefsStale(sessionId)
        deps.store.update(sessionId, { currentUrl: args.url })
        await runFor(deps, sessionId, ['wait-for-navigation', '--json', '--wait-until', waitUntil, '--timeout', timeout], {
          timeoutMs: navigationTimeout(deps), signal: exec.signal,
        })
        note = '已在新标签页打开'
      } else {
        const nav = await runFor(deps, sessionId, ['navigate', args.url, '--json', '--wait-until', waitUntil, '--timeout', timeout], {
          timeoutMs: navigationTimeout(deps), signal: exec.signal,
        })
        recordNavigation(deps, sessionId, nav)
      }
      const captured = await takeSnapshot(deps, sessionId, exec.signal)
      return observationValue(captured.record, captured.snapshot, note)
    },
    presentCall: args => ({ card: 'generic', title: `打开 ${args.url}`, kind: 'other', rawInput: args.url }),
  }))

  registerTool(ctx, defineTool({
    name: 'browser_observe',
    description:
      'Observe the current page. `mode: snapshot` (default) returns the accessibility tree with @eN refs '
      + 'and is the right first choice for understanding structure and planning actions. Use `mode: html` '
      + 'only when hidden DOM, metadata, or markup is required, and `mode: screenshot` only when visual '
      + 'layout or canvas content cannot be inferred from the snapshot.',
    parameters: {
      mode: { type: 'string', enum: [...OBSERVE_MODES], description: 'snapshot (default) | html | screenshot.' },
      ref: { type: 'string', description: 'Snapshot ref (@eN) to scope the dump or crop the screenshot.' },
      maxBytes: { type: 'integer', description: 'Byte cap for `mode: html`.' },
    },
    output: {
      schema: observeSchema,
      render: (_args, value) => {
        const seen = value as { mode: string; note: string; content: string; screenshotPath: string; screenshotSize: string }
        if (seen.mode === 'screenshot') {
          return textBlock([
            `screenshot: ${seen.screenshotPath}`,
            seen.screenshotSize === '' ? '' : `size: ${seen.screenshotSize}`,
            ...(seen.note === '' ? [] : [`note: ${seen.note}`]),
            '请用图片读取工具查看该 PNG（当前模型本身不解析图像）。',
          ].filter(line => line !== '').join('\n'))
        }
        return textBlock(`${seen.note === '' ? '' : `note: ${seen.note}\n`}${seen.content}`)
      },
    },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      const mode = args.mode ?? 'snapshot'
      const captured = await takeSnapshot(deps, sessionId, exec.signal)
      const base = observationValue(captured.record, captured.snapshot)
      if (mode === 'snapshot') {
        return { ...base, mode, content: base.snapshot, screenshotPath: '', screenshotBytes: 0, screenshotSize: '' }
      }
      if (mode === 'html') {
        const htmlArgs = ['get-html', '--json', ...(args.ref !== undefined ? ['--ref', args.ref] : []),
          ...(args.maxBytes !== undefined ? ['--max-bytes', String(args.maxBytes)] : [])]
        const html = await runFor(deps, sessionId, htmlArgs, { signal: exec.signal })
        const content = typeof html.json?.['html'] === 'string' ? html.json['html'] : html.stdout
        return {
          ...base, mode, content,
          screenshotPath: '', screenshotBytes: 0, screenshotSize: '',
          note: args.ref !== undefined ? `已按 ${args.ref} 收窄 HTML` : '',
        }
      }
      const shot = await captureScreenshot(deps, sessionId, args.ref, exec.signal)
      deps.store.update(sessionId, { lastScreenshotPath: shot.path })
      return {
        ...base, mode, content: '',
        screenshotPath: shot.path,
        screenshotBytes: shot.bytes,
        screenshotSize: shot.width === 0 ? '' : `${String(shot.width)}x${String(shot.height)}`,
        note: shot.note,
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: `观测页面（${args.mode ?? 'snapshot'}）`,
      kind: 'read',
      rawInput: args.ref ?? '',
    }),
  }))
}
