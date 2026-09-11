/** 进阶工具：悬停、诊断（console/network）、移动端模拟与文件传输。 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { formatDiagnosticEntries } from '../host/parse.js'
import { durationArg, navigationTimeout, runFor, takeSnapshot } from './actions.js'
import { observationRender, observationSchema, observationValue, refreshCurrentUrl } from './observation.js'
import { registerTool } from './register/register.js'
import { SESSION_PARAM, requireSessionId, textBlock, valueSchema, type BrowserToolDeps } from './shared.js'

/**
 * 注册进阶工具（悬停、诊断、模拟、传输）。
 * @param ctx - 宿主上下文
 * @param deps - 工具依赖
 */
export function registerAdvancedTools(ctx: Context, deps: BrowserToolDeps): void {
  registerTool(ctx, deps, defineTool({
    name: 'browser_hover',
    description:
      'Move the mouse over an element (@eN ref or CSS selector) and return a fresh snapshot: hovering usually '
      + 'reveals menus, which changes the refs.',
    parameters: {
      ...SESSION_PARAM,
      target: { type: 'string', required: true, description: 'Snapshot ref (@eN) or CSS selector.' },
      settleMs: { type: 'integer', description: 'How long to let hover-triggered UI settle (default 200).' },
    },
    output: { schema: observationSchema, render: (_args, value) => observationRender(value) },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      const command = ['hover', args.target, '--json']
      if (args.settleMs !== undefined) command.push('--settle', `${String(args.settleMs)}ms`)
      await runFor(deps, sessionId, command, { signal: exec.signal })
      deps.store.markRefsStale(sessionId)
      const captured = await takeSnapshot(deps, sessionId, exec.signal)
      return observationValue(captured.record, captured.snapshot, '悬停后已重新快照')
    },
    presentCall: args => ({ card: 'generic', title: `悬停 ${args.target}`, kind: 'other', rawInput: args.target }),
  }))

  registerTool(ctx, deps, defineTool({
    name: 'browser_inspect',
    description:
      'Read buffered diagnostics for the current tab: `console` for log/exception entries, `network` for responses '
      + 'and failures. Use it after an action fails.',
    parameters: {
      ...SESSION_PARAM,
      kind: { type: 'string', required: true, enum: ['console', 'network'], description: 'Which buffer to read.' },
      since: { type: 'integer', description: 'Only entries after this sequence number (use the previous next_since).' },
      limit: { type: 'integer', description: 'Maximum number of entries.' },
      includeStack: { type: 'boolean', description: 'Include stack traces (console only).' },
    },
    output: { schema: observationSchema, render: (_args, value) => observationRender(value) },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      const command = [args.kind, '--json']
      if (args.since !== undefined) command.push('--since', String(args.since))
      if (args.limit !== undefined) command.push('--limit', String(args.limit))
      if (args.includeStack === true && args.kind === 'console') command.push('--include-stack')
      const outcome = await runFor(deps, sessionId, command, { signal: exec.signal })
      const entries = Array.isArray(outcome.json?.['entries'])
        ? outcome.json['entries'] as Record<string, unknown>[]
        : []
      const nextSince = outcome.json?.['next_since']
      const captured = await takeSnapshot(deps, sessionId, exec.signal)
      const header = `${args.kind} 共 ${String(entries.length)} 条`
        + (nextSince !== undefined ? `（下次用 since=${String(nextSince)} 只看新增）` : '')
      return observationValue(
        captured.record,
        captured.snapshot,
        `${header}\n${formatDiagnosticEntries(entries, args.kind)}`,
      )
    },
    presentCall: args => ({
      card: 'generic',
      title: `诊断 ${args.kind}`,
      kind: 'read',
      rawInput: args.since !== undefined ? `since ${String(args.since)}` : '',
    }),
  }))

  registerTool(ctx, deps, defineTool({
    name: 'browser_emulate',
    description:
      'Emulate a mobile device environment on the current tab (viewport, DPR, mobile flag, user agent, touch). '
      + 'Pass a known `device` name, or width/height explicitly. Returns a fresh snapshot.',
    parameters: {
      ...SESSION_PARAM,
      device: { type: 'string', description: 'Known device preset name (e.g. "iPhone 15").' },
      width: { type: 'integer', description: 'Viewport width in CSS pixels.' },
      height: { type: 'integer', description: 'Viewport height in CSS pixels.' },
      dpr: { type: 'number', description: 'Device pixel ratio.' },
      mobile: { type: 'boolean', description: 'Report the mobile flag to the page.' },
      userAgent: { type: 'string', description: 'Override the user agent string.' },
      touch: { type: 'boolean', description: 'Enable touch emulation.' },
    },
    output: { schema: observationSchema, render: (_args, value) => observationRender(value) },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      const command = ['emulate', '--json']
      if (args.device !== undefined) command.push('--device', args.device)
      if (args.width !== undefined) command.push('--width', String(args.width))
      if (args.height !== undefined) command.push('--height', String(args.height))
      if (args.dpr !== undefined) command.push('--dpr', String(args.dpr))
      if (args.mobile !== undefined) command.push(args.mobile ? '--mobile' : '--no-mobile')
      if (args.userAgent !== undefined) command.push('--ua', args.userAgent)
      if (args.touch !== undefined) command.push('--touch')
      await runFor(deps, sessionId, command, { signal: exec.signal })
      deps.store.markRefsStale(sessionId)
      const captured = await takeSnapshot(deps, sessionId, exec.signal)
      return observationValue(captured.record, captured.snapshot, '模拟环境已应用，已重新快照')
    },
    presentCall: args => ({
      card: 'generic',
      title: `模拟 ${args.device ?? `${String(args.width ?? '')}x${String(args.height ?? '')}`}`,
      kind: 'other',
      rawInput: '',
    }),
  }))

  registerTool(ctx, deps, defineTool({
    name: 'browser_transfer',
    description:
      'Move a file across the browser boundary: `upload` hands local files to a page file input or drop target; '
      + '`download` captures one download and writes it to a local path.',
    parameters: {
      ...SESSION_PARAM,
      action: { type: 'string', required: true, enum: ['upload', 'download'], description: 'upload or download.' },
      target: { type: 'string', required: true, description: 'Snapshot ref (@eN) or CSS selector of the trigger.' },
      files: { type: 'array', description: 'Local file paths to upload (repeatable).', items: { type: 'string' } },
      out: { type: 'string', description: 'Local path to write the downloaded file to.' },
      mode: { type: 'string', enum: ['input', 'drop'], description: 'Upload delivery mechanism (default input).' },
      overwrite: { type: 'boolean', description: 'Allow overwriting an existing download target.' },
    },
    output: { schema: transferSchema, render: (_args, value) => textBlock(value.message) },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      if (args.action === 'upload') {
        const files = args.files ?? []
        if (files.length === 0) throw new Error('browser_transfer(upload) 需要至少一个 files 路径')
        const command = ['upload', args.target, '--json', '--timeout', durationArg(navigationTimeout(deps))]
        for (const file of files) command.push('--file', file)
        if (args.mode !== undefined) command.push('--mode', args.mode)
        const outcome = await runFor(deps, sessionId, command, { signal: exec.signal })
        const bytes = typeof outcome.json?.['bytes'] === 'number' ? outcome.json['bytes'] : 0
        return {
          action: 'upload' as const,
          target: args.target,
          path: files.join(', '),
          bytes,
          message: `已上传 ${String(files.length)} 个文件到 ${args.target}`,
        }
      }
      if (args.out === undefined) throw new Error('browser_transfer(download) 需要 out 指定落盘路径')
      const command = ['download', args.target, '--json', '--out', args.out,
        '--timeout', durationArg(navigationTimeout(deps))]
      if (args.overwrite === true) command.push('--overwrite')
      const outcome = await runFor(deps, sessionId, command, { signal: exec.signal })
      const path = typeof outcome.json?.['path'] === 'string' ? outcome.json['path'] : args.out
      const bytes = typeof outcome.json?.['byte_size'] === 'number' ? outcome.json['byte_size'] : 0
      return {
        action: 'download' as const,
        target: args.target,
        path,
        bytes,
        message: `已下载到 ${path}${bytes > 0 ? `（${String(bytes)} 字节）` : ''}`,
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: args.action === 'upload' ? `上传到 ${args.target}` : `从 ${args.target} 下载`,
      kind: 'other',
      rawInput: args.out ?? '',
    }),
  }))
}

export const transferSchema = valueSchema({
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string', required: true, enum: ['upload', 'download'] },
    target: { type: 'string', required: true },
    path: { type: 'string', required: true },
    bytes: { type: 'integer', required: true },
    message: { type: 'string', required: true },
  },
})

