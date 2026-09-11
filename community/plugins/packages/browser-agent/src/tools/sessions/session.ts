/**
 * 多会话管理：同一 DSH 会话下可以有多个浏览器会话（别名区分），
 * 其余工具用可选的 `session` 参数指向其中之一，不传就是当前活跃会话。
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_ALIAS, sessionKey } from '../../host/session/keys.js'
import { registerTool } from '../register/register.js'
import type { BrowserToolDeps } from '../shared.js'
import { requireSessionId, textBlock, valueSchema } from '../shared.js'

/** 支持的动作。 */
const ACTIONS = ['list', 'new', 'use', 'close'] as const

const sessionValue = valueSchema({
  type: 'object',
  additionalProperties: false,
  properties: {
    message: { type: 'string', required: true },
    activeAlias: { type: 'string', required: true },
    aliases: { type: 'string', required: true },
    sessions: { type: 'integer', required: true },
  },
})

/**
 * 注册 browser_session。
 * @param ctx - 宿主上下文（提供 tools 注册表）
 * @param deps - 工具依赖
 */
export function registerSessionTools(ctx: Context, deps: BrowserToolDeps): void {
  registerTool(ctx, deps, defineTool({
    name: 'browser_session',
    description:
      'Manage parallel browser sessions inside this conversation. `list` shows aliases and which one is active; '
      + '`new` starts another Agent Window under an alias and makes it active; `use` switches the active alias; '
      + '`close` stops one (default: the active one). Every other browser tool accepts an optional `session` '
      + 'alias and defaults to the active session.',
    parameters: {
      action: { type: 'string', required: true, enum: [...ACTIONS], description: 'list | new | use | close.' },
      alias: { type: 'string', description: 'Session alias (required for new/use; optional for close).' },
      url: { type: 'string', description: 'URL to open right after `new`.' },
    },
    output: { schema: sessionValue, render: (_args, value) => textBlock(value.message) },
    async execute(args, exec) {
      // 这里要的是 DSH 会话 id 本身（用于枚举名下全部别名），不是活跃键。
      const dshSessionId = requireSessionId(exec).split('#')[0] ?? ''
      const activeAlias = () => {
        const entries = deps.store.sessionsOf(dshSessionId)
        return entries.find(entry => entry.active)?.alias ?? DEFAULT_ALIAS
      }
      const describe = (): string => deps.store.sessionsOf(dshSessionId)
        .map((entry) => {
          const marker = entry.active ? '*' : ' '
          const url = entry.record.currentUrl ?? '（未打开页面）'
          return `${marker} ${entry.alias} · bsk ${entry.record.bskSessionId} · ${url}`
        })
        .join('\n')

      if (args.action === 'list') {
        const entries = deps.store.sessionsOf(dshSessionId)
        return {
          message: entries.length === 0
            ? '当前没有浏览器会话；用 browser_session(action="new") 新建一个。'
            : `共 ${String(entries.length)} 个浏览器会话（* 为活跃）：\n${describe()}`,
          activeAlias: activeAlias(),
          aliases: entries.map(entry => entry.alias).join(', '),
          sessions: entries.length,
        }
      }

      if (args.action === 'new') {
        const alias = args.alias?.trim() ?? ''
        if (alias === '') throw new Error('browser_session(new) 需要 alias')
        if (alias === DEFAULT_ALIAS) throw new Error(`别名 ${DEFAULT_ALIAS} 是默认会话保留名，请换一个`)
        if (deps.store.sessionsOf(dshSessionId).some(entry => entry.alias === alias)) {
          throw new Error(`别名 ${alias} 已存在；用 browser_session(action="use") 切换，或换一个别名`)
        }
        deps.store.setActiveAlias(dshSessionId, alias)
        const key = sessionKey(dshSessionId, alias)
        if (args.url !== undefined) deps.policy.assertNavigable(args.url)
        await deps.store.ensure(key)
        let note = ''
        if (args.url !== undefined) {
          const outcome = await deps.runner.run(
            ['navigate', args.url, '--session', deps.store.get(key)?.bskSessionId ?? '', '--json'],
            { timeoutMs: deps.config.navigationTimeoutMs, signal: exec.signal },
          )
          const finalUrl = outcome.json?.['final_url'] ?? outcome.json?.['url']
          deps.store.update(key, {
            refsStale: true,
            ...(typeof finalUrl === 'string' ? { currentUrl: finalUrl } : {}),
          })
          note = `，已打开 ${String(finalUrl ?? args.url)}`
        }
        return {
          message: `已新建浏览器会话 ${alias}（活跃）${note}\n${describe()}`,
          activeAlias: alias,
          aliases: deps.store.sessionsOf(dshSessionId).map(entry => entry.alias).join(', '),
          sessions: deps.store.sessionsOf(dshSessionId).length,
        }
      }

      if (args.action === 'use') {
        const alias = args.alias?.trim() ?? ''
        if (alias === '') throw new Error('browser_session(use) 需要 alias')
        const entries = deps.store.sessionsOf(dshSessionId)
        if (!entries.some(entry => entry.alias === alias)) {
          throw new Error(`别名 ${alias} 不存在（现有：${entries.map(entry => entry.alias).join(', ') || '无'}）`)
        }
        deps.store.setActiveAlias(dshSessionId, alias)
        return {
          message: `已切换到浏览器会话 ${alias}\n${describe()}`,
          activeAlias: alias,
          aliases: entries.map(entry => entry.alias).join(', '),
          sessions: entries.length,
        }
      }

      const alias = args.alias?.trim() ?? activeAlias()
      const key = sessionKey(dshSessionId, alias)
      const stopped = await deps.store.stop(key, 'browser_session(close)')
      if (stopped && alias === activeAlias()) deps.store.setActiveAlias(dshSessionId, DEFAULT_ALIAS)
      const entries = deps.store.sessionsOf(dshSessionId)
      return {
        message: `${stopped ? `已关闭浏览器会话 ${alias}` : `浏览器会话 ${alias} 不存在`}\n${describe() || '（已无会话）'}`,
        activeAlias: activeAlias(),
        aliases: entries.map(entry => entry.alias).join(', '),
        sessions: entries.length,
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: `浏览器会话 ${args.action}${args.alias === undefined ? '' : ` ${args.alias}`}`,
      kind: 'other',
      rawInput: args.alias ?? '',
    }),
  }))
}
