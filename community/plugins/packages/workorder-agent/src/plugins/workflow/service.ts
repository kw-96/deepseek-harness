import { createHash, randomUUID } from 'node:crypto'
import { todayInShanghai } from '../../domain/dates.js'
import { buildInspectionMessage } from '../../domain/message.js'
import { inspectIssue } from '../../domain/rules.js'
import type { InspectionRequest, InspectionResult, InspectionType } from '../../domain/types.js'
import type { GcpIssueService } from '../gcp/service.js'
import { TEST_NOTIFICATION } from '../popo/client.js'
import type { PopoDeliveryService } from '../popo/delivery.js'
import type { MessageTaskResult } from '../store/message/types.js'
import type { PreviewRecord, WorkorderStore } from '../store/store.js'

const PREVIEW_TTL_MS = 30 * 60 * 1000

function hashMessage(message: string): string {
  return createHash('sha256').update(message).digest('hex')
}

function deliveryKey(type: InspectionType, startDate: string, endDate: string, messageHash: string): string {
  return `${type}:${startDate}:${endDate}:${messageHash}`
}

/** 设计师巡检工作流，负责查询、规则、幂等和发送闸门。 */
export class InspectionWorkflow {
  constructor(
    private readonly issues: GcpIssueService,
    private readonly store: WorkorderStore,
    private readonly delivery: PopoDeliveryService,
    private readonly gcpHost: string,
  ) {}

  /** 发送固定内容的测试通知，不查询工单。 */
  async sendTestNotification(): Promise<string> {
    const key = `test-notification:${todayInShanghai()}:${randomUUID()}`
    const result = await this.sendOnce(key, TEST_NOTIFICATION, 'test-notification', undefined, 'manual-test')
    if (result.status !== 'sent' || !result.taskId) throw new Error('固定测试通知未发送')
    return result.taskId
  }

  /** 执行巡检；正式验收仅生成持久预览，不直接发送。 */
  async inspect(request: InspectionRequest): Promise<InspectionResult> {
    const runId = randomUUID()
    const snapshots = await this.issues.listCompleted(request.startDate, request.endDate)
    const violations = snapshots.flatMap(inspectIssue)
    const title = request.type === 'weekly' ? '上周工单补漏提醒' : '设计工单填写提醒'
    const message = buildInspectionMessage(
      `${title}｜${request.startDate}至${request.endDate}`,
      violations,
      this.gcpHost,
    )
    let sent = false
    let previewId: string | undefined
    if (request.type === 'acceptance' && !request.send && message) {
      previewId = this.persistPreview(request, message, { runId, snapshots: snapshots.length, violations })
    } else if (request.send && message) {
      const delivery = await this.sendOnce(
        deliveryKey(request.type, request.startDate, request.endDate, hashMessage(message)),
        message, `inspection-${request.type}`, runId,
        request.automatic ? 'automatic' : 'manual', request.automatic,
      )
      sent = delivery.status === 'sent' || delivery.status === 'already-sent'
    }
    this.store.saveRun({
      id: runId,
      type: request.type,
      startDate: request.startDate,
      endDate: request.endDate,
      status: previewId ? 'preview' : request.send ? (sent ? 'sent' : 'not-sent') : 'dry-run',
      scanned: snapshots.length,
      violationCount: violations.length,
      createdAt: new Date().toISOString(),
    })
    return { runId, previewId, ...request, scanned: snapshots.length, violations, message, sent }
  }

  /** 人工再次发送历史复核结果，每次确认均创建独立发送记录。 */
  async resendPreview(previewId: string): Promise<string> {
    const preview = this.store.getPreview(previewId)
    if (!preview) throw new Error('复核记录不存在')
    if (hashMessage(preview.message) !== preview.messageHash) throw new Error('复核消息完整性校验失败')
    const key = `manual-resend:${previewId}:${randomUUID()}`
    const result = await this.sendOnce(key, preview.message, 'preview-resend', previewId, 'manual-resend')
    if (result.status !== 'sent' || !result.taskId) throw new Error('该复核结果正在再次发送，请稍后重试')
    return result.taskId
  }

  /** 发送此前持久化且未过期的同一份预览消息。 */
  async sendPreview(previewId: string): Promise<InspectionResult> {
    const preview = this.store.getActivePreview(previewId)
    if (!preview) throw new Error('预览不存在、已过期或已发送')
    if (hashMessage(preview.message) !== preview.messageHash) throw new Error('预览消息完整性校验失败')
    const result = JSON.parse(preview.resultJson) as { runId: string; snapshots: number; violations: InspectionResult['violations'] }
    const key = deliveryKey('acceptance', preview.startDate, preview.endDate, preview.messageHash)
    const delivery = await this.sendOnce(key, preview.message, 'preview', previewId, 'confirmed-preview')
    if (!['sent', 'already-sent'].includes(delivery.status)) throw new Error('该预览消息正在发送')
    if (!this.store.markPreviewSent(previewId)) throw new Error('预览状态更新失败')
    this.store.saveRun({
      id: result.runId,
      type: preview.type,
      startDate: preview.startDate,
      endDate: preview.endDate,
      status: 'sent',
      scanned: result.snapshots,
      violationCount: result.violations.length,
      createdAt: new Date().toISOString(),
    })
    return {
      runId: result.runId, previewId, type: 'acceptance', startDate: preview.startDate,
      endDate: preview.endDate, scanned: result.snapshots,
      violations: result.violations, message: preview.message, sent: true,
    }
  }

  private persistPreview(request: InspectionRequest, message: string, result: unknown): string {
    const preview: PreviewRecord = {
      id: randomUUID(), type: request.type, startDate: request.startDate, endDate: request.endDate,
      message, messageHash: hashMessage(message), resultJson: JSON.stringify(result),
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS).toISOString(), status: 'pending',
    }
    this.store.savePreview(preview)
    return preview.id
  }

  private sendOnce(
    key: string, message: string, sourceType: string, sourceId: string | undefined,
    actor: string, automatic = false,
  ): Promise<MessageTaskResult> {
    return this.delivery.deliver({ key, message, sourceType, sourceId, actor, automatic })
  }
}
