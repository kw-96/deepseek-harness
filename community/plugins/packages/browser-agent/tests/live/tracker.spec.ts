/**
 * 实时动作跟踪测试：面板的「正在做什么 + 中断」由 ActionTracker 支撑，
 * 而工具包装器负责在每次执行前后记录与清理。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { ActionTracker } from '../../src/host/live/tracker.js'
import { liveView } from '../../src/host/live/panel.js'
import { call, makeHarness } from '../support/harness.js'

describe('动作跟踪器', () => {
  it('按会话记录当前动作，结束后清空', () => {
    const tracker = new ActionTracker()
    const controller = new AbortController()
    tracker.begin('s1', 'browser_click', 'browser_click @e2', controller.signal)
    expect(tracker.current('s1')?.toolName).toBe('browser_click')
    expect(tracker.current('s1')?.summary).toBe('browser_click @e2')
    expect(tracker.current('s2')).toBeUndefined()
    tracker.end('s1')
    expect(tracker.current('s1')).toBeUndefined()
    expect(tracker.size).toBe(0)
  })

  it('中断只对正在执行的动作生效，并触发信号', () => {
    const tracker = new ActionTracker()
    const controller = new AbortController()
    const signal = tracker.begin('s1', 'browser_wait', 'browser_wait', controller.signal)
    expect(signal.aborted).toBe(false)
    expect(tracker.interrupt('s1')).toBe(true)
    expect(signal.aborted).toBe(true)
    expect(tracker.interrupt('s1')).toBe(true)   // 记录仍在，重复中断无害
    tracker.end('s1')
    expect(tracker.interrupt('s1')).toBe(false)  // 没有正在执行的动作
  })

  it('宿主信号与中断信号合并：任一取消都生效', () => {
    const tracker = new ActionTracker()
    const outer = new AbortController()
    const signal = tracker.begin('s1', 'browser_open', 'browser_open', outer.signal)
    outer.abort()
    expect(signal.aborted).toBe(true)
  })
})

describe('工具包装器', () => {
  it('执行期间记录动作，结束后清理；中断会把工具信号置为已取消', async () => {
    const tracker = new ActionTracker()
    const harness = makeHarness({ tracker })
    // 用一个自定义工具验证包装行为：它等待信号被取消。
    const seen: string[] = []
    harness.tools.set('probe', defineTool({
      name: 'probe',
      description: 'probe',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: {} },
        render: () => [],
      },
      async execute(_args, exec) {
        seen.push('start')
        await new Promise<void>(resolve => {
          exec.signal.addEventListener('abort', () => { seen.push('aborted'); resolve() }, { once: true })
        })
        return {}
      },
    }) as never)
    // 直接用注册器包一层：与真实注册路径一致
    const { registerTool } = await import('../../src/tools/register/register.js')
    const ctx = {
      effect: (setup: () => (() => void)) => setup(),
      tools: {
        register: (definition: { name: string, execute: (args: unknown, exec: unknown) => Promise<unknown> }) => {
          harness.tools.set(definition.name, definition as never)
          return () => { harness.tools.delete(definition.name) }
        },
      },
    } as never
    const definition = harness.tools.get('probe')
    registerTool(ctx, { tracker, store: harness.store } as never, definition as never)

    const running = call(harness, 'probe', {})
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(tracker.current('sess-1')?.toolName).toBe('probe')
    expect(tracker.interrupt('sess-1')).toBe(true)
    await expect(running).rejects.toThrow(/已被中断/)
    expect(seen).toEqual(['start', 'aborted'])
    expect(tracker.current('sess-1')).toBeUndefined()
  })
})

describe('实时视图组装', () => {
  it('空闲时给出会话状态，执行中给出工具名与耗时', async () => {
    const tracker = new ActionTracker()
    const harness = makeHarness({ tracker })
    await call(harness, 'browser_open', { url: 'https://example.com' })
    const deps = { runner: harness.runner, store: harness.store, tracker, idleTimeoutMs: 60_000 }
    const idle = liveView(deps, 'sess-1', Date.now())
    expect(idle.sessionOpen).toBe(true)
    expect(idle.running).toBe(false)
    expect(idle.toolName).toBe('')
    const controller = new AbortController()
    tracker.begin('sess-1', 'browser_observe', 'browser_observe', controller.signal)
    const started = tracker.current('sess-1')?.startedAtMs ?? 0
    const running = liveView(deps, 'sess-1', started + 1500)
    expect(running.running).toBe(true)
    expect(running.summary).toBe('browser_observe')
    expect(running.elapsedMs).toBe(1500)
  })
})
