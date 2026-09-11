/** 导航与标签页工具（历史导航刷新引用；标签页默认只看 Agent Window）。 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { parseTabs } from '../host/parse.js'
import type { BrowserTabView } from '../types.js'
import { observationRender, observationSchema, observationValue, refreshCurrentUrl } from './observation.js'
import { durationArg, navigationTimeout, runFor, takeSnapshot } from './actions.js'
import { registerTool } from './register/register.js'
import { SESSION_PARAM, requireSessionId, textBlock, valueSchema, type BrowserToolDeps, type ExecLike } from './shared.js'

const HISTORY_ACTIONS = ['back', 'forward', 'reload'] as const
const TAB_ACTIONS = ['list', 'create', 'close', 'select', 'borrow', 'return'] as const
const TAB_SCOPES = ['agent', 'user', 'all'] as const

const tabsSchema = valueSchema({
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string', required: true },
    message: { type: 'string', required: true },
    tabs: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tabId: { type: 'string', required: true },
          title: { type: 'string', required: true },
          url: { type: 'string', required: true },
          scope: { type: 'string', required: true },
        },
      },
    },
  },
})

/**
 * 注册 browser_history 与 browser_tabs。
 * @param ctx - 宿主上下文（提供 tools 注册表）
 * @param deps - 工具依赖
 */
export function registerNavigateTools(ctx: Context, deps: BrowserToolDeps): void {
/** 可等待的页面生命周期阶段。 */
const WAIT_STATES = ['load', 'domcontentloaded', 'networkidle', 'commit'] as const

  registerTool(ctx, deps, defineTool({
    name: 'browser_wait',
    description:
      'Wait before observing again: either a fixed delay (`ms`) or a page lifecycle state (`state`) such as '
      + '`networkidle`. Give exactly one of the two. Returns the page URL after waiting.',
    parameters: {
      ...SESSION_PARAM,
      ms: { type: 'integer', description: 'Fixed delay in milliseconds.' },
      state: { type: 'string', enum: [...WAIT_STATES], description: 'Lifecycle phase to wait for.' },
      timeoutMs: { type: 'integer', description: 'Hard timeout (default: the navigation timeout).' },
    },
    output: { schema: observationSchema, render: (_args, value) => observationRender(value) },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      if (args.ms === undefined && args.state === undefined) throw new Error('browser_wait 需要 ms 或 state 之一')
      if (args.ms !== undefined && args.state !== undefined) throw new Error('browser_wait 的 ms 与 state 只能给一个')
      if (args.ms !== undefined) {
        // wait-ms 不接受 --session，是 daemon 侧睡眠；先确保 daemon 已在运行。
        await deps.store.ensure(sessionId)
        await deps.runner.run(['wait-ms', `${String(args.ms)}ms`], {
          timeoutMs: args.ms + deps.config.actionTimeoutMs,
          signal: exec.signal,
        })
      }
      else {
        await runFor(deps, sessionId, [
          'wait-for-navigation', '--wait-until', String(args.state),
          '--timeout', durationArg(args.timeoutMs ?? navigationTimeout(deps)),
        ], { signal: exec.signal })
      }
      const captured = await takeSnapshot(deps, sessionId, exec.signal)
      await refreshCurrentUrl(deps, sessionId, exec.signal)
      const waited = args.ms !== undefined ? `等待 ${String(args.ms)} 毫秒` : `等待页面进入 ${String(args.state)}`
      return observationValue(deps.store.get(sessionId) ?? captured.record, captured.snapshot, `${waited}后已重新快照`)
    },
    presentCall: args => ({
      card: 'generic',
      title: args.ms !== undefined ? `等待 ${String(args.ms)} 毫秒` : `等待 ${String(args.state ?? '')}`,
      kind: 'read',
      rawInput: '',
    }),
  }))

  registerTool(ctx, deps, defineTool({
    name: 'browser_history',
    description: 'Go back, go forward, or reload the current tab, then return a fresh accessibility snapshot.',
    parameters: {
      ...SESSION_PARAM,
      action: { type: 'string', required: true, enum: [...HISTORY_ACTIONS], description: 'back | forward | reload.' },
      hard: { type: 'boolean', description: 'With reload: bypass the HTTP cache.' },
    },
    output: { schema: observationSchema, render: (_args, value) => observationRender(value) },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      const command = args.action === 'reload'
        ? ['reload', '--json', ...(args.hard === true ? ['--hard'] : []), '--timeout', durationArg(deps.config.navigationTimeoutMs)]
        : [`navigate-${args.action}`, '--json', '--timeout', durationArg(deps.config.navigationTimeoutMs)]
      await runFor(deps, sessionId, command, { timeoutMs: deps.config.navigationTimeoutMs, signal: exec.signal })
      deps.store.markRefsStale(sessionId)
      const captured = await takeSnapshot(deps, sessionId, exec.signal)
      // 后退/前进/刷新可能落在应用内路由上，URL 一律以活动标签页为准。
      await refreshCurrentUrl(deps, sessionId, exec.signal)
      return observationValue(
        deps.store.get(sessionId) ?? captured.record,
        captured.snapshot,
        `${args.action} 后已重新快照`,
      )
    },
    presentCall: args => ({ card: 'generic', title: `导航 ${args.action}`, kind: 'other', rawInput: args.action }),
  }))

  registerTool(ctx, deps, defineTool({
    name: 'browser_tabs',
    description:
      'Manage tabs in the Agent Window. Scope defaults to `agent`; pass `scope: user` to see the tabs of the '
      + 'user\'s own windows, then use `borrow` to move one into the Agent Window (always `return` it when done). '
      + 'Write actions (`close`, `select`, `borrow`, `return`) need the numeric `tabId` from a previous listing.',
    parameters: {
      ...SESSION_PARAM,
      action: { type: 'string', required: true, enum: [...TAB_ACTIONS], description: 'list | create | close | select | borrow | return.' },
      tabId: { type: 'string', description: 'Target tab id for close/select/borrow/return.' },
      url: { type: 'string', description: 'Destination URL for create.' },
      scope: { type: 'string', enum: [...TAB_SCOPES], description: 'Listing scope for list (default agent).' },
    },
    output: {
      schema: tabsSchema,
      render: (_args, value) => {
        const seen = value as { message: string; tabs: BrowserTabView[] }
        const lines = seen.tabs.map(tab => `- [${tab.scope}] ${tab.tabId} ${tab.title === '' ? '(无标题)' : tab.title} — ${tab.url}`)
        return textBlock([seen.message, ...lines].join('\n'))
      },
    },
    async execute(args, exec) {
      const sessionId = requireSessionId(exec)
      const scope = args.scope ?? 'agent'
      let message = ''
      if (args.action === 'list') {
        message = `标签页（scope=${scope}）`
      } else if (args.action === 'create') {
        const command = ['tab', 'create', '--json', ...(args.url !== undefined ? ['--url', args.url] : [])]
        const created = await runFor(deps, sessionId, command, { timeoutMs: deps.config.navigationTimeoutMs, signal: exec.signal })
        deps.store.markRefsStale(sessionId)
        message = `已新建标签页（tab_id=${String(created.json?.['tab_id'] ?? '未知')}）`
      } else {
        if (args.tabId === undefined || args.tabId === '') {
          throw new Error(`browser_tabs 的 ${args.action} 需要 tabId：先用 action=list 取回列表`)
        }
        if (args.action === 'borrow') {
          await requireApproval(deps, exec, 'browser_tabs', `把用户标签页 ${args.tabId} 借用进 Agent Window`)
        }
        await runFor(deps, sessionId, ['tab', args.action, args.tabId, '--json'], { signal: exec.signal })
        deps.store.markRefsStale(sessionId)
        message = `已对标签页 ${args.tabId} 执行 ${args.action}`
      }
      const listed = await runFor(deps, sessionId, ['tab', 'list', '--json', '--scope', scope], { signal: exec.signal })
      const tabs = parseTabs(listed.json)
      deps.store.update(sessionId, { tabCount: tabs.length })
      return { action: args.action, message, tabs }
    },
    presentCall: args => ({ card: 'generic', title: `标签页 ${args.action}`, kind: 'other', rawInput: args.action }),
  }))
}

/**
 * 执行一次必须获批的操作；未获批时抛出说明性错误。
 * @param deps - 工具依赖
 * @param exec - 工具执行上下文（审批需要发起调用方的 Agent）
 * @param toolName - 记录审批归属的工具名
 * @param reason - 向用户解释为什么需要批准
 */
export async function requireApproval(
  deps: BrowserToolDeps,
  exec: ExecLike & { callId?: unknown },
  toolName: string,
  reason: string,
): Promise<void> {
  if (!deps.config.requireApprovalForBorrow) return
  const approval = deps.approval
  if (approval === undefined) {
    throw new Error(`${reason}：当前部署未挂载审批服务，已拒绝执行（如需放行请把 requireApprovalForBorrow 设为 false）`)
  }
  const outcome = await approval.request({
    agent: exec.agent,
    toolName,
    ...(exec.callId !== undefined ? { callId: exec.callId } : {}),
    reason,
    signal: exec.signal,
  })
  if (outcome !== 'allowed-once') {
    throw new Error(`${reason}：用户未批准（${outcome}）`)
  }
}
