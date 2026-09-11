/**
 * 周期巡检的失败隔离与宿主会话判定。
 *
 * 巡检由 `timer.interval` 驱动，其回调里的异常若逃逸会成为未处理拒绝，在
 * Node 24 下直接终止整个 `dsh web` 进程。这里既验证隔离本身，也验证巡检确实
 * 经真实 `ctx.agents` 判定宿主会话是否还存在。
 */

import { Context } from '@deepseek-ai/cordis'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import BrowserAgent from '../lib/types/index.js'
import { resolveConfig } from '../lib/types/host/config.js'
import type { BskSessionStore } from '../src/host/store.js'
import { runSweep } from '../src/host/sweep.js'

/** 只保留 tools 注册表语义的替身。 */
const registry = {
  register: () => () => {},
}

/** 只实现 BskRunner 用到的最小面：解析可执行文件 + 执行命令。 */
function fakeSubprocess(): unknown {
  return {
    resolveExecutable: async (name: string) => name,
    spawn: (request: { argv: readonly string[] }) => ({
      done: Promise.resolve({ exitCode: 0 }),
      collected: {
        stdout: {
          readFrom: () => ({ text: request.argv.includes('start') ? '{"session_id":"bsk-1"}' : '{}' }),
        },
        stderr: { readFrom: () => ({ text: '' }) },
      },
    }),
  }
}

interface Fixture {
  ctx: Context
  store: BskSessionStore
  sweep: () => void
  warnings: string[]
  dispose: () => Promise<void>
}

/**
 * 挂载真实插件并暴露其内部会话托管器与巡检回调。
 * @param isOwnerAlive - 宿主会话存活判定所依赖的 agents 服务替身
 * @returns 夹具
 */
function makeFixture(isOwnerAlive: { get: (id: string) => unknown }): Fixture {
  const ctx = new Context()
  ctx.reflect.provide('tools', registry)
  ctx.reflect.provide('subprocess', fakeSubprocess())
  ctx.reflect.provide('agents', isOwnerAlive)
  const sweeps: Array<() => void> = []
  ctx.reflect.provide('timer', {
    interval: (callback: () => void) => {
      sweeps.push(callback)
      return () => { sweeps.splice(sweeps.indexOf(callback), 1) }
    },
  })
  const warnings: string[] = []
  ctx.logger.warn = ((message: unknown) => { warnings.push(String(message)) }) as never
  const plugin = new BrowserAgent(ctx, resolveConfig({ binary: 'bsk', browserInstance: 'edge', bskHome: TEST_BSK_HOME }))
  const store = (plugin as unknown as { store: BskSessionStore }).store
  return {
    ctx,
    store,
    sweep: () => { sweeps[0]!() },
    warnings,
    dispose: async () => { await ctx.fiber.dispose() },
  }
}

/**
 * 测试专用的 bsk home：让测试自己起一个 daemon。
 *
 * 必须隔离——本地子进程运行时用 Job 对象托管子进程，测试结束时回收 Job 会连带
 * 杀掉默认 home 下的真实 daemon，从而破坏正在使用插件的会话。
 */
const TEST_BSK_HOME = join(tmpdir(), `bsk-test-home-${String(process.pid)}`)
describe('runSweep 失败隔离', () => {
  it('巡检抛错时只记录，不向调用方抛出', async () => {
    const logged: string[] = []
    const target = {
      keys: () => { throw new Error('agents 不可用') },
      peek: () => undefined,
      stop: async () => false,
      forgetActive: () => {},
      ownerAlive: () => true,
      idleTimeoutMs: () => 60_000,
    }
    await expect(runSweep(target, 0, message => { logged.push(message) })).resolves.toBeUndefined()
    expect(logged.join()).toContain('会话巡检失败')
    expect(logged.join()).toContain('agents 不可用')
  })
})

describe('真实 Cordis 组合下的周期巡检', () => {
  it('宿主会话已不存在时回收记录', async () => {
    const fixture = makeFixture({ get: () => undefined })
    try {
      await fixture.store.ensure('sess-1')
      expect(fixture.store.get('sess-1')).toBeDefined()
      fixture.sweep()
      await vi.waitFor(() => { expect(fixture.store.get('sess-1')).toBeUndefined() })
    } finally {
      await fixture.dispose()
    }
  })

  it('存活判定抛错时记录告警并保留记录', async () => {
    const fixture = makeFixture({
      get: () => { throw new Error('cannot get property "agents" without inject') },
    })
    try {
      await fixture.store.ensure('sess-1')
      fixture.sweep()
      await vi.waitFor(() => { expect(fixture.warnings.length).toBeGreaterThan(0) })
      expect(fixture.warnings.join()).toContain('会话巡检失败')
      expect(fixture.store.get('sess-1')).toBeDefined()
    } finally {
      await fixture.dispose()
    }
  })
})
