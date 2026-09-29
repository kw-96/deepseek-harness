import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'

export const WORKORDER_SKILL_NAME = 'workorder-webhook-review'

function skillContent(knowledgeBase: string): string {
  return `
你负责复核易协作新建工单事件。

收到事件后：
1. 仅依据用户消息中的不可变工单快照和以下提单规范审核，不调用工具，不得修改工单。
2. 核验交付日期、工时、设计数量、交付通道与 AI 管线耗时等字段是否完整合理。
3. 输出简洁中文结论，依次给出“结论”“需补全项”“说明”；信息不足时明确指出缺失项，不得猜测。
4. 不发送 POPO 消息，不执行定时任务，不改变任何外部状态。

提单规范：
${knowledgeBase}
`.trim()
}

/** 在指定 Agent 作用域挂载工单 Webhook 复核 Skill。 */
export function mountWorkorderSkill(agentCtx: Context, knowledgeBase: string): void {
  agentCtx.skills.register({
    name: WORKORDER_SKILL_NAME,
    description: '复核易协作新建工单字段，并给出只读中文检查结论。',
    whenToUse: '收到工单 Webhook 事件或需要语义复核工单字段时使用。',
    source: 'runtime',
    content: skillContent(knowledgeBase),
    invocation: { modelInvocable: true, userInvocable: false },
  })
}
