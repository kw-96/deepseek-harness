import { describe, expect, it, vi } from 'vitest'
import { startScheduler } from '../../src/plugins/scheduler/scheduler.js'

const cronCallbacks: Array<() => Promise<void>> = []

vi.mock('croner', () => ({
  Cron: class {
    constructor(_pattern: string, _options: unknown, callback: () => Promise<void>) {
      cronCallbacks.push(callback)
    }
    stop(): void {}
  },
}))

describe('调度和自动发送开关', () => {
  it('调度开启但自动发送关闭时仅执行 dry-run', async () => {
    cronCallbacks.length = 0
    const inspect = vi.fn(async (): Promise<void> => undefined)
    const flags = new Map([['schedule_enabled', true], ['automatic_send_enabled', false]])
    const stop = startScheduler({ inspect } as never, {
      getFlag: vi.fn((key: string): boolean => flags.get(key) ?? false),
    } as never)
    await cronCallbacks[0]?.()
    expect(inspect).toHaveBeenCalledWith(expect.objectContaining({ type: 'daily', automatic: true, send: false }))
    stop()
  })

  it('调度默认关闭时不执行巡检', async () => {
    cronCallbacks.length = 0
    const inspect = vi.fn(async (): Promise<void> => undefined)
    const stop = startScheduler({ inspect } as never, { getFlag: vi.fn(() => false) } as never)
    await cronCallbacks[0]?.()
    expect(inspect).not.toHaveBeenCalled()
    stop()
  })
})
