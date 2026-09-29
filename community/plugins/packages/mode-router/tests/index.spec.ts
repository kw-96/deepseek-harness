import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/index.ts'

/** 记录注册进来的动态上下文，并支持回收观察。 */
interface CapturedContext {
  name: string
  order: number
  text: (context: unknown) => string
}

/**
 * 造一个能跑 apply 的最小宿主：假 agents 服务提供 agent，agent 的 ctx.inject
 * 直接把 systemPrompt 交给插件（等价于 Cordis 在该 agent 作用域里的注入）。
 * @param sessionId - 该 agent 所属会话 id
 * @returns 根上下文、捕获的上下文、agent 的注入数量与手动触发 agent/disposed 的函数
 */
function makeHost(sessionId = 'session-1') {
  const contexts: CapturedContext[] = []
  let injections = 0
  const remove = (contribution: CapturedContext): void => {
    const at = contexts.indexOf(contribution)
    if (at >= 0) contexts.splice(at, 1)
  }
  const agent = {
    session: { id: sessionId },
    ctx: {
      // 模拟 Cordis 的注入作用域：回调里注册的效果随该 fiber 的 dispose 一起回收。
      inject: (_deps: readonly string[], callback: (scope: unknown) => unknown) => {
        injections += 1
        const scoped: Array<() => void> = []
        const scopedSystemPrompt = {
          context: (contribution: CapturedContext) => {
            contexts.push(contribution)
            const disposer = (): void => { remove(contribution) }
            scoped.push(disposer)
            return disposer
          },
        }
        callback({ systemPrompt: scopedSystemPrompt })
        return {
          dispose: async () => {
            for (const disposer of scoped.splice(0)) disposer()
          },
        }
      },
    },
  }
  const ctx = new Context()
  ctx.provide('agents', { list: () => [agent] })
  return { ctx, contexts, agent, injections: () => injections }
}

/** 造一条 user/message 事件。 */
function userMessage(text: string) {
  return { type: 'user/message', data: { content: [{ type: 'text', text }] } }
}

describe('mode-router 插件接线', () => {
  it('导出插件名与 inject 声明', () => {
    expect(name).toBe('dsh-mode-router')
    expect(inject).toEqual(['agents'])
  })

  it('挂载后为已存在的 agent 注册一条动态上下文，排序位默认 130', () => {
    const { ctx, contexts, injections } = makeHost()
    apply(ctx as never, {})
    expect(injections()).toBe(1)
    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.name).toBe('context:mode-router')
    expect(contexts[0]?.order).toBe(130)
  })

  it('尚未收到用户消息时不注入任何内容', () => {
    const { ctx, contexts, agent } = makeHost()
    apply(ctx as never, {})
    const text = contexts[0]?.text({ agent })
    expect(text).toBe('')
  })

  it('按最近一条用户消息渲染注入文本，并写明命中依据', () => {
    const { ctx, contexts, agent } = makeHost()
    apply(ctx as never, {})
    ctx.emit('session/event' as never, agent.session as never, userMessage('这个构建报错了，帮我修复一下') as never)
    const text = contexts[0]?.text({ agent }) ?? ''
    expect(text).toContain('本轮模式路由')
    expect(text).toContain('正确性')
    expect(text).toContain('报错')
  })

  it('体验类消息渲染成体验模式；后一条消息覆盖前一条', () => {
    const { ctx, contexts, agent } = makeHost('session-2')
    apply(ctx as never, {})
    ctx.emit('session/event' as never, agent.session as never, userMessage('帮我修复构建报错') as never)
    expect(contexts[0]?.text({ agent })).toContain('正确性')
    ctx.emit('session/event' as never, agent.session as never, userMessage('这个侧栏的间距和颜色不好看') as never)
    const latest = contexts[0]?.text({ agent }) ?? ''
    expect(latest).toContain('体验')
    expect(latest).not.toContain('正确性')
  })

  it('配置 enabled: false 时不注册任何注入', () => {
    const { ctx, contexts, injections } = makeHost()
    apply(ctx as never, { enabled: false })
    expect(contexts).toHaveLength(0)
    expect(injections()).toBe(0)
  })

  it('order 非法时当场报错，而不是静默取默认值', () => {
    const { ctx } = makeHost()
    expect(() => { apply(ctx as never, { order: Number.NaN }) }).toThrow(/order/)
  })

  it('agent 会话结束后回收注入与状态', async () => {
    const { ctx, contexts, agent } = makeHost('session-3')
    apply(ctx as never, {})
    ctx.emit('session/event' as never, agent.session as never, userMessage('修复报错') as never)
    expect(contexts).toHaveLength(1)
    ctx.emit('agent/disposed' as never, { agent } as never)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(contexts).toHaveLength(0)
  })

  it('插件卸载后注入被回收（HMR 安全）', async () => {
    const { ctx, contexts } = makeHost('session-4')
    apply(ctx as never, {})
    expect(contexts).toHaveLength(1)
    await ctx.fiber.dispose()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(contexts).toHaveLength(0)
  })
})
