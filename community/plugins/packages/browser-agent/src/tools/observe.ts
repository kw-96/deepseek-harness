/** 观测类工具：打开页面与按需升级的观测方式（快照优先，HTML/截图按需）。 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ImageRefLike } from '../host/attachment.js'
import { captureScreenshot, observationRender, observationSchema, observationValue } from './observation.js'
import type { BrowserToolDeps } from './shared.js'
import {
  durationArg, navigationTimeout, recordNavigation, runFor, takeSnapshot,
} from './actions.js'
import { SESSION_PARAM, observeSchema, requireSessionId, textBlock } from './shared.js'
import { registerTool } from './register/register.js'

/** 观测模式。 */
const OBSERVE_MODES = ['snapshot', 'html', 'screenshot'] as const
/** 等待条件取值。 */
const WAIT_UNTIL = ['load', 'domcontentloaded', 'networkidle', 'commit'] as const

/**
 * 注册 browser_open 与 browser_observe。
 * @param ctx - 宿主上下文（提供 tools 注册表）
 * @param deps - 工具依赖
 */
export function registerObserveTools(ctx: Context, deps: BrowserToolDeps): void {
  registerTool(ctx, deps, defineTool({
    name: 'browser_open',
    description:
      'Open a URL in the browser automation window (an isolated Agent Window; the user\'s own '
      + 'windows are untouched) and return the page\'s accessibility snapshot with @eN element refs. '
      + 'Every earlier ref becomes invalid after this call — use only refs from the returned snapshot.',
    parameters: {
      ...SESSION_PARAM,
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

  registerTool(ctx, deps, defineTool({
    name: 'browser_observe',
    description:
      'Observe the current page. `mode: snapshot` (default) returns the accessibility tree with @eN refs '
      + 'and is the right first choice for understanding structure and planning actions. Use `mode: html` '
      + 'only when hidden DOM, metadata, or markup is required, and `mode: screenshot` only when visual '
      + 'layout or canvas content cannot be inferred from the snapshot.',
    parameters: {
      ...SESSION_PARAM,
      mode: { type: 'string', enum: [...OBSERVE_MODES], description: 'snapshot (default) | html | screenshot.' },
      ref: { type: 'string', description: 'Snapshot ref (@eN) to scope the dump or crop the screenshot.' },
      maxBytes: { type: 'integer', description: 'Byte cap for `mode: html`.' },
    },
    output: {
      schema: observeSchema,
      render: (_args, value) => {
        const seen = value as {
          mode: string, note: string, content: string, screenshotPath: string, screenshotSize: string
          image?: ImageRefLike | undefined
        }
        if (seen.mode === 'screenshot') {
          const headline = seen.image === undefined
            ? [
              `screenshot: ${seen.screenshotPath}`,
              seen.screenshotSize === '' ? '' : `size: ${seen.screenshotSize}`,
              ...(seen.note === '' ? [] : [`note: ${seen.note}`]),
              '当前部署无法内联图像，请用读图工具查看该 PNG。',
            ].filter(line => line !== '').join('\n')
            : [
              `screenshot: ${seen.screenshotSize === '' ? seen.screenshotPath : seen.screenshotSize}`,
              ...(seen.note === '' ? [] : [`note: ${seen.note}`]),
            ].join('\n')
          const blocks: ContentBlock[] = textBlock(headline)
          if (seen.image !== undefined) {
            blocks.push({
              type: 'image',
              // 结构上即宿主的 ImageAttachmentRef；不引入运行时依赖，故此处断言。
              attachment: {
                attachmentId: seen.image.attachmentId,
                mediaType: seen.image.mediaType,
                bytes: seen.image.bytes,
                width: seen.image.width,
                height: seen.image.height,
              } as never,
            })
          }
          return blocks
        }
        return textBlock(`${seen.note === '' ? '' : `note: ${seen.note}\n`}${seen.content}`)
      },
    },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      const mode = args.mode ?? 'snapshot'
      const captured = await takeSnapshot(deps, sessionId, exec.signal)
      const seen = observationValue(captured.record, captured.snapshot)
      // 只回传 observeSchema 声明的字段：多一个键就会被注册表的
      // additionalProperties:false 拒掉（曾经把 observationValue 整份展开而踩过）。
      const common = {
        url: seen.url,
        title: seen.title,
        bskSessionId: seen.bskSessionId,
        refs: seen.refs,
        truncated: seen.truncated,
      }
      if (mode === 'snapshot') {
        return { ...common, mode, note: '', content: seen.snapshot, screenshotPath: '', screenshotBytes: 0, screenshotSize: '' }
      }
      if (mode === 'html') {
        const htmlArgs = ['get-html', '--json', ...(args.ref !== undefined ? ['--ref', args.ref] : []),
          ...(args.maxBytes !== undefined ? ['--max-bytes', String(args.maxBytes)] : [])]
        const html = await runFor(deps, sessionId, htmlArgs, { signal: exec.signal })
        const content = typeof html.json?.['html'] === 'string' ? html.json['html'] : html.stdout
        return {
          ...common, mode, content,
          screenshotPath: '', screenshotBytes: 0, screenshotSize: '',
          note: args.ref !== undefined ? `已按 ${args.ref} 收窄 HTML` : '',
        }
      }
      const shot = await captureScreenshot(deps, sessionId, args.ref, exec.signal)
      deps.store.update(sessionId, { lastScreenshotPath: shot.path })
      return {
        ...common, mode, content: '',
        screenshotPath: shot.path,
        screenshotBytes: shot.bytes,
        screenshotSize: shot.width === 0 ? '' : `${String(shot.width)}x${String(shot.height)}`,
        note: shot.note,
        // 只在真有附件时带上该键：schema 用 additionalProperties:false，多余键会被拒。
        ...(shot.image !== undefined ? {
          image: {
            attachmentId: shot.image.attachmentId,
            mediaType: shot.image.mediaType,
            bytes: shot.image.bytes,
            width: shot.image.width,
            height: shot.image.height,
          },
        } : {}),
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
