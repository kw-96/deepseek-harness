/**
 * 工具注册与包装：所有 `browser_*` 工具都经这里挂到 `ctx.tools`。
 *
 * 包装器承担两件事——把 `session` 别名解析成会话键写进调用上下文（多会话支持），
 * 以及记录/中断当前动作（面板的实时观测）。两者都不需要各工具自己实现。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { ActionTracker } from '../../host/live/tracker.js'
import { sessionKey } from '../../host/session/keys.js'
import type { BrowserToolDeps, ExecLike } from '../shared.js'
import { setSessionKey } from '../shared.js'
/**
 * 注册一个模型工具，并把释放器绑定到当前 fiber。
 *
 * 仓库约定「注册即 effect」：即便注册表本身不绑定调用方 fiber，插件卸载 /
 * Cordis HMR 热替换时也必须把工具摘干净——否则重挂载会撞上重复工具名。
 * @param ctx - 当前插件上下文
 * @param definition - 工具定义
 */
export function registerTool(ctx: Context, deps: BrowserToolDeps, definition: ToolDefinition): void {
  ctx.effect(() => ctx.tools.register(wrapTool(definition, deps)), `browser-agent:${definition.name}`)
}

/**
 * 给工具定义套一层动作跟踪：面板能看到正在执行的动作，并能中断它。
 *
 * 中断通过取消合并后的信号实现——`bsk` 子进程带的就是这个信号，被取消时
 * CLI 子进程被杀，daemon 侧随之协同取消，因此不需要额外的 cancel 命令。
 * @param definition - 原始工具定义
 * @param tracker - 动作跟踪器
 * @returns 包装后的工具定义
 */
function wrapTool(definition: ToolDefinition, deps: BrowserToolDeps): ToolDefinition {
  return {
    ...definition,
    execute: async (args, exec) => {
      const agent = (exec as ExecLike).agent
      if (agent === undefined) return await definition.execute(args, exec)
      const dshSessionId = String(agent.session.id)
      const alias = readAlias(args)
      const key = alias === '' ? deps.store.activeKey(dshSessionId) : sessionKey(dshSessionId, alias)
      const tracker = deps.tracker
      const signal = tracker === undefined
        ? exec.signal
        : tracker.begin(key, definition.name, summarizeCall(definition.name, args), exec.signal)
      // 只有在「面板取消、而宿主没取消」时才算中断：即便工具忽略信号并正常返回，
      // 动作也没有真正完成，如实报中断比返回半成品好。
      const interrupted = (): boolean => tracker !== undefined && signal.aborted && !exec.signal.aborted
      const inner = { ...exec, signal }
      setSessionKey(inner, key)
      try {
        const result = await definition.execute(args, inner)
        if (interrupted()) throw new Error(`${definition.name} 已被中断`)
        return result
      }
      catch (error: unknown) {
        if (interrupted()) throw new Error(`${definition.name} 已被中断`)
        throw error
      }
      finally {
        tracker?.end(key)
      }
    },
  } as ToolDefinition
}

/**
 * 读取模型给出的会话别名。
 * @param args - 工具参数
 * @returns 别名；未给出时为 ''
 */
function readAlias(args: unknown): string {
  const value = (args as Record<string, unknown> | undefined)?.['session']
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 生成面板显示的一句话摘要。
 * @param name - 工具名
 * @param args - 工具参数
 * @returns 摘要
 */
function summarizeCall(name: string, args: unknown): string {
  const record = (args ?? {}) as Record<string, unknown>
  for (const key of ['target', 'url', 'kind', 'action', 'key', 'tabId', 'ref', 'mode']) {
    const value = record[key]
    if (typeof value === 'string' && value !== '') return `${name} ${value}`
    if (typeof value === 'number') return `${name} ${String(value)}`
  }
  return name
}
