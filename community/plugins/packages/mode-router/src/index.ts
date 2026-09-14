/**
 * mode-router —— 会话级轻量模式路由（自研）。
 *
 * 挂在一个 agent 预设里：每轮读取该会话最近一条用户消息，确定性判定「本轮以
 * 什么为验收重心」，并把它作为**动态上下文**注入。注入走官方的
 * `systemPrompt.context`，默认进入模型历史，因此模型看到的这段文本在会话日志里
 * 可重建、可复核（符合「model-visible ⟺ logged」）。
 * @module dsh-mode-router
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { classifyTurn, renderRouteContext } from './classify.js'

/** Cordis 插件名。 */
export const name = 'dsh-mode-router'

/** 依赖 agents 服务来逐 agent 安装注入。 */
export const inject = ['agents']

/** 插件配置。 */
export interface Config {
  /** 关掉即完全不注入（默认开）。 */
  enabled?: boolean
  /** 动态上下文的排序位（默认排在沙箱/审批策略之后）。 */
  order?: number
}

/** 动态上下文的默认排序位：紧随内建的沙箱/审批/委派策略。 */
export const DEFAULT_ORDER = 130

/**
 * 校验预设行传入的配置，配错就报错而不是静默取默认值。
 * @param config - 预设行配置
 * @returns 归一化后的配置
 */
function resolveConfig(config: Config): { enabled: boolean; order: number } {
  const order = config.order ?? DEFAULT_ORDER
  if (!Number.isFinite(order)) {
    throw new Error(`dsh-mode-router: order 必须是有限数，收到 ${JSON.stringify(config.order)}`)
  }
  return { enabled: config.enabled ?? true, order }
}

/**
 * 从 `user/message` 事件里取出可判定的文本。
 * @param data - 事件负载（模型消息）
 * @returns 拼接后的纯文本；结构不符合预期时返回空串
 */
function messageText(data: unknown): string {
  if (data === null || typeof data !== 'object') return ''
  const content = (data as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const record = block as { type?: unknown; text?: unknown }
    if (record.type === 'text' && typeof record.text === 'string') parts.push(record.text)
  }
  return parts.join('\n')
}

/**
 * 挂载逐轮模式路由。
 * @param ctx - agent 平面上下文（预设内）
 * @param config - 预设行传入的配置
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = resolveConfig(config)
  if (!resolved.enabled) {
    ctx.logger.info('dsh-mode-router: 已按配置关闭，不注入任何内容')
    return
  }
  const order = resolved.order
  // 每会话最近一条用户消息：注入文本的判定依据。会话结束后随 agent 一起回收。
  const latest = new Map<string, string>()
  const fibers = new Map<unknown, ReturnType<Context['inject']>>()

  ctx.on('session/event', (session, event) => {
    if (event.type !== 'user/message') return
    latest.set(session.id, messageText(event.data))
  })

  const install = (agent: { ctx: Context }): void => {
    if (fibers.has(agent)) return
    const fiber = agent.ctx.inject(['systemPrompt'], (scope) => {
      scope.systemPrompt.context({
        name: 'context:mode-router',
        order,
        text: (context) => {
          const session = context.agent?.session
          if (session === undefined) return ''
          const message = latest.get(session.id)
          return message === undefined ? '' : renderRouteContext(classifyTurn(message))
        },
      })
    })
    fibers.set(agent, fiber)
  }
  const disposeAgent = (agent: { ctx: Context }): void => {
    const fiber = fibers.get(agent)
    if (fiber === undefined) return
    fibers.delete(agent)
    void fiber.dispose().catch((error: unknown) => {
      ctx.logger.warn(`dsh-mode-router: 注入回收失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }

  for (const agent of ctx.agents.list()) install(agent)
  ctx.on('agent/created', ({ agent }) => { install(agent) })
  ctx.on('agent/disposed', ({ agent }) => {
    disposeAgent(agent)
    latest.delete(agent.session.id)
  })
  ctx.effect(() => async () => {
    const pending = [...fibers.values()]
    fibers.clear()
    latest.clear()
    await Promise.all(pending.map(fiber => fiber.dispose()))
  }, 'dsh-mode-router: 注入回收')
}
