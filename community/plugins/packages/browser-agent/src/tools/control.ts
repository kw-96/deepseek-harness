/**
 * 控制类工具：状态查询、结束会话、人工求助与（默认关闭的）脚本执行。
 * 结束会话走 store，因此不会留下无人回收的 Agent Window。
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { parseBrowsers, parseSessions } from '../host/parse.js'
import type { BrowserInstanceView } from '../types.js'
import { ackRender, refreshCurrentUrl } from './observation.js'
import { durationArg, runFor } from './actions.js'
import { registerTool } from './register/register.js'
import { SESSION_PARAM, requireSessionId, textBlock, valueSchema, type BrowserToolDeps } from './shared.js'

/** 人工求助默认等待上限（毫秒）。 */
const DEFAULT_HELP_TIMEOUT_MS = 300_000
/** evaluate 结果文本上限（字符）。 */
const EVALUATE_MAX_CHARS = 20_000

const statusSchema = valueSchema({
  type: 'object',
  additionalProperties: false,
  properties: {
    daemon: { type: 'string', required: true },
    connected: { type: 'boolean', required: true },
    browsers: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          instanceId: { type: 'string', required: true },
          browserName: { type: 'string', required: true },
          label: { type: 'string', required: true },
          extensionVersion: { type: 'string', required: true },
          versionSkew: { type: 'boolean', required: true },
        },
      },
    },
    sessionOpen: { type: 'boolean', required: true },
    bskSessionId: { type: 'string', required: true },
    currentUrl: { type: 'string', required: true },
    idleDeadlineAtMs: { type: 'integer', required: true },
    ownedSessions: { type: 'integer', required: true },
    otherSessions: { type: 'integer', required: true },
  },
})

/**
 * 注册 browser_status / browser_stop / browser_ask_human / browser_evaluate。
 * @param ctx - 宿主上下文（提供 tools 注册表）
 * @param deps - 工具依赖
 */
export function registerControlTools(ctx: Context, deps: BrowserToolDeps): void {
  registerTool(ctx, deps, defineTool({
    name: 'browser_status',
    description:
      'Report browser automation health: the bsk daemon, connected browsers, and whether this session '
      + 'currently owns an Agent Window. Use it when a command fails unexpectedly.',
    parameters: { ...SESSION_PARAM },
    output: {
      schema: statusSchema,
      render: (_args, value) => {
        const seen = value as {
          daemon: string, connected: boolean, browsers: BrowserInstanceView[], sessionOpen: boolean
          bskSessionId: string, currentUrl: string, ownedSessions: number, otherSessions: number
        }
        const lines = [
          `daemon: ${seen.daemon}`,
          `已连接浏览器: ${seen.connected ? '是' : '否'}`,
          ...seen.browsers.map(b => `- ${b.browserName} ${b.extensionVersion}（${b.label}${b.versionSkew ? '，版本不一致' : ''}）`),
          `本会话 Agent Window: ${seen.sessionOpen ? `已开启（${seen.bskSessionId}）` : '未开启'}`,
          `当前页面: ${seen.currentUrl === '' ? '(无)' : seen.currentUrl}`,
          `本插件持有会话: ${String(seen.ownedSessions)}；其它工具遗留会话: ${String(seen.otherSessions)}`,
        ]
        return textBlock(lines.join('\n'))
      },
    },
    async execute(_args, exec) {
      const sessionId = requireSessionId(exec)
      const status = await deps.runner.run(['status', '--json'], { allowFailure: true })
      const listed = await deps.runner.run(['session', 'list', '--json'], { allowFailure: true })
      const owned = deps.store.ownedSessionIds()
      const others = parseSessions(listed.rows).filter(id => !owned.includes(id)).length
      const record = deps.store.get(sessionId)
      if (record !== undefined) await refreshCurrentUrl(deps, sessionId, exec.signal)
      const current = deps.store.get(sessionId)
      return {
        daemon: `v${String(status.json?.['daemon_version'] ?? '未知')}`,
        connected: parseBrowsers(status.json).length > 0,
        browsers: parseBrowsers(status.json),
        sessionOpen: current !== undefined,
        bskSessionId: current?.bskSessionId ?? '',
        currentUrl: current?.currentUrl ?? '',
        idleDeadlineAtMs: current === undefined ? 0 : current.lastActionAtMs + deps.config.actionTimeoutMs,
        ownedSessions: owned.length,
        otherSessions: others,
      }
    },
    presentCall: () => ({ card: 'generic', title: '浏览器状态', kind: 'read', rawInput: '' }),
  }))

  registerTool(ctx, deps, defineTool({
    name: 'browser_stop',
    description:
      'End this session\'s browser automation session: closes the Agent Window and returns every borrowed tab. '
      + 'Call it when the browser work is finished; the plugin also stops automatically on idle, on session end, '
      + 'and on unload.',
    parameters: { ...SESSION_PARAM },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: { message: { type: 'string' as const, required: true }, refsValid: { type: 'boolean' as const, required: true } },
      },
      render: (_args, value) => ackRender(value),
    },
    async execute(_args, exec) {
      const sessionId = requireSessionId(exec)
      const stopped = await deps.store.stop(sessionId, '模型主动结束')
      return {
        message: stopped ? '已结束浏览器会话，Agent Window 已关闭' : '当前没有进行中的浏览器会话',
        refsValid: false,
      }
    },
    presentCall: () => ({ card: 'generic', title: '结束浏览器会话', kind: 'other', rawInput: '' }),
  }))

  registerTool(ctx, deps, defineTool({
    name: 'browser_ask_human',
    description:
      'Pause and ask the human to do something in the page (solve a captcha, finish a login, confirm a '
      + 'destructive action). The page stays interactive and the named targets are highlighted. Blocks until '
      + 'the user continues, cancels, or the wait times out. Treat `continued` as confirmation and `cancelled` '
      + 'as refusal.',
    parameters: {
      ...SESSION_PARAM,
      prompt: { type: 'string', required: true, description: 'What the user must do, in the user\'s language.' },
      title: { type: 'string', description: 'Optional overlay title.' },
      targets: { type: 'array', items: { type: 'string', description: 'Snapshot ref (@eN) or CSS selector.' }, description: 'Elements to scroll to and highlight.' },
      timeoutMs: { type: 'integer', description: 'How long to wait in milliseconds (default 300000).' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          outcome: { type: 'string' as const, required: true },
          note: { type: 'string' as const, required: true },
          message: { type: 'string' as const, required: true },
        },
      },
      render: (_args, value) => textBlock(String((value as { message: string }).message)),
    },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      const timeoutMs = args.timeoutMs ?? DEFAULT_HELP_TIMEOUT_MS
      const command = ['request-help', '--prompt', args.prompt, '--json', '--timeout', durationArg(timeoutMs)]
      if (args.title !== undefined) command.push('--title', args.title)
      for (const target of args.targets ?? []) command.push('--target', target)
      const help = await runFor(deps, sessionId, command, { timeoutMs: timeoutMs + 15_000, signal: exec.signal })
      const outcome = String(help.json?.['outcome'] ?? 'unknown')
      const note = String(help.json?.['note'] ?? '')
      deps.store.markRefsStale(sessionId)
      return { outcome, note, message: `用户处置结果：${outcome}${note === '' ? '' : `（备注：${note}）`}` }
    },
    presentCall: args => ({ card: 'generic', title: '请求人工协助', kind: 'other', rawInput: args.prompt }),
  }))

  registerTool(ctx, deps, defineTool({
    name: 'browser_evaluate',
    description:
      'Evaluate a JavaScript expression in the current page. Disabled unless the deployment enables '
      + '`allowEvaluate`, and always refused on credential surfaces (login, banking, password managers). '
      + 'Prefer snapshot plus click/fill/select; use this only when those cannot express the step.',
    parameters: {
      ...SESSION_PARAM,
      expression: { type: 'string', required: true, description: 'JavaScript expression; use an IIFE for statements.' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: { value: { type: 'string' as const, required: true }, message: { type: 'string' as const, required: true } },
      },
      render: (_args, value) => textBlock(String((value as { message: string }).message)),
    },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      const record = await deps.store.ensure(sessionId)
      deps.policy.assertEvaluateAllowed(record.currentUrl)
      const evaluated = await runFor(deps, sessionId, ['evaluate', args.expression, '--json'], { signal: exec.signal })
      const raw = JSON.stringify(evaluated.json?.['value'] ?? null)
      const value = raw.length > EVALUATE_MAX_CHARS ? `${raw.slice(0, EVALUATE_MAX_CHARS)}…（已截断）` : raw
      return { value, message: `evaluate 结果：${value}` }
    },
    presentCall: args => ({ card: 'generic', title: '执行脚本', kind: 'other', rawInput: args.expression }),
  }))
}
