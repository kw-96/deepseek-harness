import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-skill'
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
import type { AppConfig } from '../config.js'
import type { IssueSnapshot } from '../domain/types.js'
import { mountWorkorderSkill, WORKORDER_SKILL_NAME } from './skill.js'

export const WORKORDER_AGENT_ID = 'workorder-agent-background'

export interface WorkorderAgentRouter {
  reviewIssue(traceId: string, issue: IssueSnapshot): Promise<string>
}

/** 基于 Harness ctx.agents 的后台单实例工单 Agent 路由器。 */
export class HarnessWorkorderAgent implements WorkorderAgentRouter {
  private handle?: AgentHandle
  private creating?: Promise<Agent>
  private reviewQueue: Promise<void> = Promise.resolve()

  constructor(private readonly ctx: Context, private readonly review: AppConfig['review']) {}

  /** 创建或复用唯一后台 Agent，并返回本次工单的模型审核文字。 */
  reviewIssue(traceId: string, issue: IssueSnapshot): Promise<string> {
    const result = this.reviewQueue.then(
      () => this.reviewOne(traceId, issue),
      () => this.reviewOne(traceId, issue),
    )
    this.reviewQueue = result.then(() => undefined, () => undefined)
    return result
  }

  private async reviewOne(traceId: string, issue: IssueSnapshot): Promise<string> {
    const agent = await this.getOrCreate()
    const previousMessages = agent.session.deriveMessages().length
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: this.buildPrompt(traceId, issue) }],
      source: { kind: 'plugin', plugin: 'workorder-agent', form: 'instructions' },
    }))
    await agent.whenIdle()
    const response = agent.session.deriveMessages().slice(previousMessages)
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.content)
      .flatMap((part) => part.type === 'text' ? [part.text] : [])
      .join('\n')
      .trim()
    if (!response) throw new Error('审核模型未返回文字结论')
    return response
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
        agentOptions: {
          ...(this.review.provider && this.review.model
            ? { provider: this.review.provider, model: this.review.model }
            : {}),
          maxTokens: this.review.maxTokens,
        },
        setup: (agentCtx) => mountWorkorderSkill(agentCtx, this.review.knowledgeBase),
      }).then((handle) => {
        this.handle = handle
        return handle.agent
      }).finally(() => {
        this.creating = undefined
      })
    }
    return this.creating
  }

  private buildPrompt(traceId: string, issue: IssueSnapshot): string {
    return [
      `请使用 Skill「${WORKORDER_SKILL_NAME}」复核新建工单。`,
      `trace_id：${traceId}`,
      '以下是已从易协作读取的不可变工单快照：',
      JSON.stringify(issue),
      '只输出审核结论，不输出思考过程。',
    ].join('\n')
  }
}
