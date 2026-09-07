import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'

export const WORKORDER_SKILL_NAME = 'workorder-webhook-review'

const WORKORDER_SKILL_CONTENT = `
你负责复核易协作新建工单事件。

收到事件后：
1. 仅使用已挂载的 mcp__gcp__* 只读工具获取工单信息，不得修改工单。
2. 重点检查交付日期、工时、设计数量、交付通道与 AI 流水线时间等字段是否完整合理。
3. 输出简洁中文结论；信息不足时明确指出缺失项，不得猜测。
4. 不发送 POPO 消息，不执行定时任务，不改变任何外部状态。
`.trim()

/** 在指定 Agent 作用域挂载工单 Webhook 复核 Skill。 */
export function mountWorkorderSkill(agentCtx: Context): void {
  agentCtx.skills.register({
    name: WORKORDER_SKILL_NAME,
    description: '复核易协作新建工单字段，并给出只读中文检查结论。',
    whenToUse: '收到工单 Webhook 事件或需要语义复核工单字段时使用。',
    source: 'runtime',
    content: WORKORDER_SKILL_CONTENT,
    invocation: { modelInvocable: true, userInvocable: false },
  })
}
