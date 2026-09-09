import { describe, expect, it, vi } from 'vitest'
import { HarnessWorkorderAgent, WORKORDER_AGENT_ID } from '../../src/harness/agent.js'
import { WORKORDER_SKILL_NAME } from '../../src/harness/skill.js'

function issue(id: number) {
  return {
    id, projectName: '渠道美术', subject: '主题', submitterName: '提单人', assigneeName: '用户',
    statusName: '美术完成', gameProduct: '', expectedDeliveryDate: '', artCategory: '',
    deliveryChannel: '', returnDeliveryChannel: '', aiDeliveryChannel: '', aiPipelineTime: '',
    totalHours: '', designQuantity: '', startDate: '', dueDate: '', createdOn: '', updatedOn: '', closedOn: '',
  }
}

function setup() {
  const messages: Array<{ role: string; content: Array<{ type: string; text: string }> }> = []
  const followup = vi.fn(() => { messages.push({ role: 'assistant', content: [{ type: 'text', text: '审核结论' }] }) })
  const dispose = vi.fn(async (): Promise<void> => undefined)
  const whenIdle = vi.fn(async (): Promise<void> => undefined)
  const register = vi.fn()
  let liveAgent: { followup: typeof followup; whenIdle: typeof whenIdle; session: { deriveMessages: () => typeof messages } } | undefined
  const create = vi.fn(async (options: { setup?: (ctx: unknown) => void }) => {
    options.setup?.({ skills: { register } })
    liveAgent = { followup, whenIdle, session: { deriveMessages: () => messages } }
    return { agent: liveAgent, dispose }
  })
  const ctx = { agents: { get: vi.fn(() => liveAgent), create } }
  const review = { enabled: true, maxTokens: 800, knowledgeBase: '提单规范', notificationEnabled: true }
  return { router: new HarnessWorkorderAgent(ctx as never, review), create, followup, register, dispose }
}

describe('Harness 后台工单 Agent', () => {
  it('并发审核时仅创建一个 Agent，并返回每次审核结论', async () => {
    const { router, create, followup, register } = setup()
    await expect(Promise.all([router.reviewIssue('trace-1', issue(101)), router.reviewIssue('trace-2', issue(102))])).resolves.toEqual(['审核结论', '审核结论'])
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ sessionId: WORKORDER_AGENT_ID, agentOptions: { maxTokens: 800 } }))
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ name: WORKORDER_SKILL_NAME }))
    expect(followup).toHaveBeenCalledTimes(2)
  })

  it('关闭时释放自身创建的 Agent', async () => {
    const { router, dispose } = setup()
    await router.reviewIssue('trace-1', issue(101))
    await router.close()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
