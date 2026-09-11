/**
 * 组合测试：在真实 Cordis 生命周期里挂载插件，验证挂载/卸载与默认配置兜底。
 * 刻意从**编译产物** `lib/types/index.js` 导入——那是应用实际加载的文件，
 * 也绕开了源码装饰器在测试转译器里的限制。
 *
 * BSK_E2E=1 时再通过同一组合、用工具定义本身跑一遍真实浏览器流程：与 GUI
 * 内挂载后模型调用走同一段代码，差别只在没有 Loader / ToolRuntime 外壳。
 */

import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import BrowserAgent from '../lib/types/index.js'
import { resolveConfig } from '../lib/types/host/config.js'

const enabled = process.env['BSK_E2E'] === '1'

const TOOL_NAMES = [
  'browser_ask_human', 'browser_click', 'browser_evaluate', 'browser_fill', 'browser_history',
  'browser_observe', 'browser_open', 'browser_press', 'browser_select', 'browser_status',
  'browser_stop', 'browser_tabs',
]

/** 只保留注册/注销语义的工具注册表替身。 */
function registry(registered: Map<string, ToolDefinition>) {
  return {
    register: (definition: ToolDefinition) => {
      registered.set(definition.name, definition)
      return () => { registered.delete(definition.name) }
    },
  }
}

/** 准备一个带 tools/subprocess/agents 服务的真实上下文。 */
function makeContext(registered: Map<string, ToolDefinition>): Context {
  const ctx = new Context()
  ctx.reflect.provide('tools', registry(registered))
  // Service 子类在构造时自行注册，不能再 provide 一次。
  void new LocalSubprocessRuntime(ctx)
  // 孤儿巡检经 `ctx.agents` 判定宿主会话，插件据此声明了 `agents` 注入。
  ctx.reflect.provide('agents', { get: () => undefined })
  return ctx
}

describe('真实 Cordis 组合', () => {
  it('声明 agents 注入：孤儿巡检经 ctx.agents 判定宿主会话', () => {
    // 巡检回调访问 `ctx.agents`；漏声明会让该访问抛
    // `cannot get property "agents" without inject`，并终止整个 dsh web 进程。
    expect(BrowserAgent.inject).toEqual(['agents', 'tools', 'subprocess'])
  })

  it('挂载后注册 12 个工具，卸载后全部释放', async () => {
    const registered = new Map<string, ToolDefinition>()
    const ctx = makeContext(registered)
    await ctx.plugin(BrowserAgent, resolveConfig({ binary: 'bsk' }))
    expect([...registered.keys()].sort()).toEqual(TOOL_NAMES)
    await ctx.fiber.dispose()
    expect(registered.size).toBe(0)
  })

  it('空配置也能挂载（构造期兜底默认值）', () => {
    const registered = new Map<string, ToolDefinition>()
    const ctx = makeContext(registered)
    void new BrowserAgent(ctx, {})
    expect([...registered.keys()].sort()).toEqual(TOOL_NAMES)
    void ctx.fiber.dispose()
  })
})

describe.skipIf(!enabled)('工具级真实浏览器端到端（组合内）', () => {
  it('browser_open → observe → status → stop 全流程', async () => {
    const registered = new Map<string, ToolDefinition>()
    const ctx = makeContext(registered)
    await ctx.plugin(BrowserAgent, resolveConfig({ binary: 'bsk' }))
    const exec = { agent: { session: { id: 'composition' } }, signal: AbortSignal.timeout(120_000) }
    const call = async (name: string, args: unknown): Promise<Record<string, unknown>> => {
      const tool = registered.get(name)
      if (tool === undefined) throw new Error(`未注册工具：${name}`)
      return await tool.execute(args, exec as never) as Record<string, unknown>
    }
    try {
      const opened = await call('browser_open', { url: 'https://example.com' })
      expect(String(opened['snapshot'])).toContain('Example Domain')
      expect(String(opened['url'])).toContain('example.com')

      const observed = await call('browser_observe', {})
      expect(observed['mode']).toBe('snapshot')
      expect(Number(observed['refs'])).toBeGreaterThan(0)

      const status = await call('browser_status', {})
      expect(status['connected']).toBe(true)
      expect(status['sessionOpen']).toBe(true)
      expect(status['ownedSessions']).toBe(1)

      const stopped = await call('browser_stop', {})
      expect(String(stopped['message'])).toContain('已结束')
      const after = await call('browser_status', {})
      expect(after['sessionOpen']).toBe(false)
      expect(after['ownedSessions']).toBe(0)
    } finally {
      await ctx.fiber.dispose()
    }
  }, 180_000)
})
