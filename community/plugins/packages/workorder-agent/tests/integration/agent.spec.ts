import { describe, expect, it, vi } from 'vitest'
import { HarnessWorkorderAgent, WORKORDER_AGENT_ID } from '../../src/harness/agent.js'
import { WORKORDER_SKILL_NAME } from '../../src/harness/skill.js'

function setup(): {
  router: HarnessWorkorderAgent
  create: ReturnType<typeof vi.fn>
  followup: ReturnType<typeof vi.fn>
  register: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
} {
  const followup = vi.fn()
  const dispose = vi.fn(async (): Promise<void> => undefined)
  const whenIdle = vi.fn(async (): Promise<void> => undefined)
  let liveAgent: { followup: typeof followup; whenIdle: typeof whenIdle } | undefined
  const register = vi.fn()
  const create = vi.fn(async (options: { setup?: (ctx: unknown) => void }) => {
    options.setup?.({ skills: { register } })
    liveAgent = { followup, whenIdle }
    return { agent: liveAgent, dispose }
  })
  const ctx = { agents: { get: vi.fn(() => liveAgent), create } }
  return { router: new HarnessWorkorderAgent(ctx as never), create, followup, register, dispose }
}

describe('Harness 后台工单 Agent', () => {
  it('并发路由时仅创建一个 Agent 并复用后续回合', async () => {
    const { router, create, followup, register } = setup()
    await Promise.all([
      router.routeWebhook('trace-1', 101, '渠道美术'),
      router.routeWebhook('trace-2', 102, '渠道美术'),
    ])
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ sessionId: WORKORDER_AGENT_ID }))
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ name: WORKORDER_SKILL_NAME }))
    expect(followup).toHaveBeenCalledTimes(2)
  })

  it('关闭时释放自身创建的 Agent', async () => {
    const { router, dispose } = setup()
    await router.routeWebhook('trace-1', 101, '渠道美术')
    await router.close()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
