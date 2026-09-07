import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-skill'
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
import { mountWorkorderSkill, WORKORDER_SKILL_NAME } from './skill.js'

export const WORKORDER_AGENT_ID = 'workorder-agent-background'

export interface WorkorderAgentRouter {
  routeWebhook(traceId: string, issueId: number, projectName: string): Promise<void>
}

/** 基于 Harness ctx.agents 的后台单实例工单 Agent 路由器。 */
export class HarnessWorkorderAgent implements WorkorderAgentRouter {
  private handle?: AgentHandle
  private creating?: Promise<Agent>

  constructor(private readonly ctx: Context) {}

  /** 创建或复用唯一后台 Agent，并把 Webhook 事件路由为后续回合。 */
  async routeWebhook(traceId: string, issueId: number, projectName: string): Promise<void> {
    const agent = await this.getOrCreate()
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: this.buildPrompt(traceId, issueId, projectName) }],
      source: { kind: 'plugin', plugin: 'workorder-agent', form: 'instructions' },
    }))
    await agent.whenIdle()
  }

  /** 停止由该路由器创建的后台 Agent。 */
  async close(): Promise<void> {
    const handle = this.handle
    this.handle = undefined
    this.creating = undefined
    await handle?.dispose()
  }

  private async getOrCreate(): Promise<Agent> {
    const existing = this.ctx.agents.get(WORKORDER_AGENT_ID as never)
    if (existing) return existing
    if (!this.creating) {
      this.creating = this.ctx.agents.create({
        sessionId: WORKORDER_AGENT_ID as never,
        meta: { cwd: process.cwd() },
        setup: (agentCtx) => mountWorkorderSkill(agentCtx),
      }).then((handle) => {
        this.handle = handle
        return handle.agent
      }).finally(() => {
        this.creating = undefined
      })
    }
    return this.creating
  }

  private buildPrompt(traceId: string, issueId: number, projectName: string): string {
    return [
      `请使用 Skill「${WORKORDER_SKILL_NAME}」复核新建工单。`,
      `trace_id：${traceId}`,
      `项目：${projectName}`,
      `工单 ID：${issueId}`,
      '使用 mcp__gcp__get_issue_base 查询详情，只输出检查结论。',
    ].join('\n')
  }
}
