import { randomUUID } from 'node:crypto'
import type { AppConfig } from '../../config.js'
import { buildIssueReviewMessage } from '../../domain/message.js'
import { inspectIssue } from '../../domain/rules.js'
import type { IssueSnapshot } from '../../domain/types.js'
import type { WorkorderAgentRouter } from '../../harness/agent.js'
import type { ReviewNotificationStatus } from '../store/types.js'
import type { WorkorderStore } from '../store/store.js'
import type { PopoDeliveryService } from '../popo/delivery.js'

export interface IssueReviewRequest {
  traceId?: string
  triggerType: 'webhook' | 'manual'
  issue: IssueSnapshot
}

/** 单张工单审核工作流，持久化规则、模型与 POPO 投递结果。 */
export class IssueReviewWorkflow {
  constructor(
    private readonly store: WorkorderStore,
    private readonly delivery: PopoDeliveryService,
    private readonly host: string,
    private readonly review: AppConfig['review'],
    private readonly agent?: WorkorderAgentRouter,
  ) {}

  /** 执行规则与模型审核，并在允许时向提单人发送群机器人提醒。 */
  async reviewIssue(request: IssueReviewRequest): Promise<string> {
    const { issue } = request
    const violations = inspectIssue(issue).map(({ ruleId, message }) => ({ ruleId, message }))
    const model = await this.reviewByModel(request.traceId, issue)
    const notification = await this.notifySubmitter(issue, violations, model.output)
    const id = randomUUID()
    this.store.reviews.save({
      id,
      traceId: request.traceId,
      issueId: issue.id,
      projectName: issue.projectName,
      submitterName: issue.submitterName || issue.assigneeName || '未识别提单人',
      triggerType: request.triggerType,
      violations,
      modelStatus: model.status,
      modelOutput: model.output,
      notificationStatus: notification.status,
      ...notification.taskId ? { notificationTaskId: notification.taskId } : {},
      ...notification.error ? { notificationError: notification.error } : {},
    })
    this.store.appendAudit({
      category: 'issue-review', action: 'completed', subject: String(issue.id),
      detail: { reviewId: id, triggerType: request.triggerType, modelStatus: model.status, notificationStatus: notification.status },
      actor: request.triggerType === 'webhook' ? 'webhook' : 'admin-ui',
    })
    return id
  }

  private async reviewByModel(traceId: string | undefined, issue: IssueSnapshot): Promise<{ status: 'completed' | 'failed' | 'skipped'; output: string }> {
    if (!this.review.enabled) return { status: 'skipped', output: '模型审核未启用；已完成规则核验。' }
    if (!this.agent) return { status: 'skipped', output: '模型审核路由不可用；已完成规则核验。' }
    try {
      return { status: 'completed', output: await this.agent.reviewIssue(traceId ?? `manual-${randomUUID()}`, issue) }
    } catch (error) {
      return { status: 'failed', output: `模型审核失败：${error instanceof Error ? error.message : String(error)}` }
    }
  }

  private async notifySubmitter(
    issue: IssueSnapshot,
    violations: Array<{ ruleId: string; message: string }>,
    modelOutput: string,
  ): Promise<{ status: ReviewNotificationStatus; taskId?: string; error?: string }> {
    if (violations.length === 0) return { status: 'not-required' }
    if (!this.review.notificationEnabled) return { status: 'disabled' }
    const message = buildIssueReviewMessage(issue, violations, modelOutput, this.host)
    try {
      const result = await this.delivery.deliver({
        key: `issue-review:${issue.id}:${issue.updatedOn}:${violations.map((item) => item.ruleId).join(',')}`,
        message,
        sourceType: 'issue-review',
        sourceId: String(issue.id),
        actor: 'workorder-review',
        automatic: true,
      })
      if (result.status === 'sent' || result.status === 'already-sent') return { status: 'sent', taskId: result.taskId }
      if (result.status === 'blocked') return { status: 'blocked' }
      return { status: 'in-progress', taskId: result.taskId }
    } catch (error) {
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
    }
  }
}
