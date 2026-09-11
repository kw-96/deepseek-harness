/**
 * 导航与标签页工具。历史导航会刷新引用并发回新快照；标签页列表默认只看
 * Agent Window（scope=agent），要看用户自己的窗口必须显式指定，避免无意中
 * 把个人标签页暴露给模型。
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { parseTabs } from '../host/parse.js'
import type { BrowserTabView } from '../types.js'
import { requireApproval } from './approval.js'
import { observationRender, observationSchema, observationValue, refreshCurrentUrl } from './observation.js'
import type { BrowserToolDeps } from './shared.js'
import { durationArg, registerTool, runFor, takeSnapshot } from './actions.js'
import { requireSessionId, textBlock, valueSchema } from './shared.js'

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
  registerTool(ctx, defineTool({
    name: 'browser_history',
    description: 'Go back, go forward, or reload the current tab, then return a fresh accessibility snapshot.',
    parameters: {
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

  registerTool(ctx, defineTool({
    name: 'browser_tabs',
    description:
      'Manage tabs in the Agent Window. Scope defaults to `agent`; pass `scope: user` to see the tabs of the '
      + 'user\'s own windows, then use `borrow` to move one into the Agent Window (always `return` it when done). '
      + 'Write actions (`close`, `select`, `borrow`, `return`) need the numeric `tabId` from a previous listing.',
    parameters: {
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
