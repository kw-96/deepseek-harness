import { Hono } from 'hono'
import type { AppConfig } from '../../config.js'
import type { WorkorderAgentRouter } from '../../harness/agent.js'
import { toAdminIssue } from './issues.js'
import { createRateLimit } from './rateLimit.js'
import { dateRangeSchema, issueIdSchema, messageIdSchema, previewIdSchema, resendPreviewSchema, resumeMessageSchema, reviewSettingsSchema, runtimeSettingsSchema, sendPreviewSchema, statsQuerySchema } from './validation.js'
import type { GcpIssueService } from '../gcp/service.js'
import type { PopoDeliveryService } from '../popo/delivery.js'
import type { WorkorderStatsService } from '../stats/service.js'
import type { WorkorderStore } from '../store/store.js'
import type { InspectionWorkflow } from '../workflow/service.js'
import type { IssueReviewWorkflow } from '../workflow/review.js'
import { todayInShanghai } from '../../domain/dates.js'

/** 控制面配置更新器；更新完成前必须等待 Host 重载。 */
export type PluginSettingsWrite = (patch: Record<string, unknown>) => Promise<void>

export interface AdminRouteDependencies {
  config: AppConfig
  store: WorkorderStore
  issues: GcpIssueService
  delivery: PopoDeliveryService
  workflow: InspectionWorkflow
  review: IssueReviewWorkflow
  stats: WorkorderStatsService
  agentRouter?: WorkorderAgentRouter
  writePluginSettings?: PluginSettingsWrite
}

function reviewSettings(config: AppConfig): Record<string, unknown> {
  return {
    reviewEnabled: config.review.enabled,
    reviewProvider: config.review.provider ?? '',
    reviewModel: config.review.model ?? '',
    reviewMaxTokens: config.review.maxTokens,
    reviewKnowledgeBase: config.review.knowledgeBase,
    reviewNotificationEnabled: config.review.notificationEnabled,
  }
}

/** 注册工单控制面的鉴权后管理 API。 */
export function installAdminRoutes(app: Hono, dependencies: AdminRouteDependencies): void {
  const { config, store, issues, delivery, workflow, review, stats, writePluginSettings } = dependencies
  const actionLimit = createRateLimit(5, 60_000)
  app.get('/api/admin/status', (context) => context.json({
    healthy: store.health().ready,
    settings: {
      scheduleEnabled: store.getFlag('schedule_enabled'),
      automaticSendEnabled: store.getFlag('automatic_send_enabled'),
      webhookProcessingEnabled: store.getFlag('webhook_processing_enabled'),
    },
    configured: {
      gcpUserKey: Boolean(config.gcp.userKey), popoWebhook: Boolean(config.popo.url),
      webhookEntry: Boolean(config.webhookToken), adminToken: Boolean(config.adminToken),
    },
    review: { enabled: config.review.enabled, notificationEnabled: config.review.notificationEnabled,
      model: config.review.provider && config.review.model ? `${config.review.provider}/${config.review.model}` : '继承 Harness 默认模型' },
    projects: config.projects, completedStatusId: config.completedStatusId,
    runs: store.listRuns(), webhooks: store.listWebhooks(), previews: store.listPreviews(),
  }))
  app.get('/api/admin/previews/:id', (context) => {
    const parsed = previewIdSchema.safeParse(context.req.param('id'))
    if (!parsed.success) return context.json({ error: '预览标识无效' }, 400)
    const preview = store.getPreviewDetail(parsed.data)
    return preview ? context.json(preview) : context.json({ error: '复核记录不存在' }, 404)
  })
  app.post('/api/admin/settings', actionLimit, async (context) => {
    const parsed = runtimeSettingsSchema.safeParse(await context.req.json())
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? '设置值无效' }, 400)
    const keys = { scheduleEnabled: 'schedule_enabled', automaticSendEnabled: 'automatic_send_enabled', webhookProcessingEnabled: 'webhook_processing_enabled' } as const
    for (const [name, value] of Object.entries(parsed.data)) if (value !== undefined) store.setFlag(keys[name as keyof typeof keys], value, 'admin-ui')
    store.appendAudit({ category: 'settings', action: 'updated', subject: 'runtime', detail: parsed.data, actor: 'admin-ui' })
    return context.json({ message: '运行设置已保存' })
  })
  app.get('/api/admin/review-settings', (context) => context.json(reviewSettings(config)))
  app.post('/api/admin/review-settings', actionLimit, async (context) => {
    const parsed = reviewSettingsSchema.safeParse(await context.req.json())
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? '审核配置无效' }, 400)
    if (!writePluginSettings) return context.json({ error: 'Harness 设置服务不可用，无法保存审核配置' }, 503)
    await writePluginSettings(parsed.data)
    return context.json({ message: '审核模型与提单规范已保存，控制面正在重载' })
  })
  app.get('/api/admin/issues', (context) => {
    const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 200), 1), 500)
    return context.json({ items: store.issues.list(limit).map((item) => toAdminIssue(item, config.gcp.host)), total: store.issues.count() })
  })
  app.get('/api/admin/issues/:id', (context) => {
    const parsed = issueIdSchema.safeParse(context.req.param('id'))
    if (!parsed.success) return context.json({ error: '工单标识无效' }, 400)
    const issue = store.issues.get(parsed.data)
    return issue ? context.json(toAdminIssue(issue, config.gcp.host)) : context.json({ error: '工单不存在' }, 404)
  })
  app.post('/api/admin/issues/sync', actionLimit, async (context) => {
    const parsed = dateRangeSchema.safeParse(await context.req.json())
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? '查询日期无效' }, 400)
    const synced = await issues.listCompleted(parsed.data.startDate, parsed.data.endDate)
    return context.json({ message: `已同步 ${synced.length} 张美术完成工单`, items: synced.map((item) => toAdminIssue(item, config.gcp.host)) })
  })
  app.post('/api/admin/issues/:id/review', actionLimit, async (context) => {
    const parsed = issueIdSchema.safeParse(context.req.param('id'))
    if (!parsed.success) return context.json({ error: '工单标识无效' }, 400)
    const issue = store.issues.get(parsed.data)
    if (!issue) return context.json({ error: '工单不存在，请先同步或等待 Webhook 入库' }, 404)
    const reviewId = await review.reviewIssue({ triggerType: 'manual', issue })
    return context.json({ message: '工单填写核验已完成', reviewId, review: store.reviews.get(reviewId) })
  })
  app.get('/api/admin/issue-reviews', (context) => {
    const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 100), 1), 500)
    return context.json({ items: store.reviews.list(limit) })
  })
  app.get('/api/admin/issue-reviews/:id', (context) => {
    const review = store.reviews.get(context.req.param('id'))
    return review ? context.json(review) : context.json({ error: '填写核验记录不存在' }, 404)
  })
  app.get('/api/admin/stats', (context) => {
    const parsed = statsQuerySchema.safeParse({ startDate: context.req.query('startDate'), endDate: context.req.query('endDate') })
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? '统计查询参数无效' }, 400)
    return context.json(stats.compute(parsed.data.startDate, parsed.data.endDate))
  })
  app.get('/api/admin/popo/capabilities', (context) => context.json({
    configured: Boolean(config.popo.url), signed: Boolean(config.popo.secret), available: store.health().ready,
    features: { chunking: true, chunkTracking: true, resumeFailed: true, fullResend: true, recall: false },
    recallReason: '自定义群机器人 Webhook 未提供已授权的撤回能力',
  }))
  app.get('/api/admin/popo/messages', (context) => {
    const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 30), 1), 100)
    return context.json({ items: store.messages.list(limit, context.req.query('status') || undefined) })
  })
  app.get('/api/admin/popo/messages/:id', (context) => {
    const id = messageIdSchema.safeParse(context.req.param('id'))
    if (!id.success) return context.json({ error: '消息标识无效' }, 400)
    const message = store.messages.get(id.data)
    return message ? context.json(message) : context.json({ error: 'POPO 消息记录不存在' }, 404)
  })
  app.post('/api/admin/popo/messages/:id/resume', actionLimit, async (context) => {
    const id = messageIdSchema.safeParse(context.req.param('id'))
    const body = resumeMessageSchema.safeParse(await context.req.json())
    if (!id.success || !body.success) return context.json({ error: '消息记录或确认信息无效' }, 400)
    try { return context.json({ message: 'POPO 消息已从失败分段继续发送', ...(await delivery.resume(id.data)) }) } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return context.json({ error: detail }, detail.includes('不可续发') || detail.includes('已经全部发送') ? 409 : 500)
    }
  })
  app.post('/api/admin/test-notification', actionLimit, async (context) => context.json({ message: '固定测试通知已发送', messageTaskId: await workflow.sendTestNotification() }))
  app.post('/api/admin/preview-today', actionLimit, async (context) => {
    const date = todayInShanghai()
    return context.json(await workflow.inspect({ type: 'daily', startDate: date, endDate: date, send: false }))
  })
  app.post('/api/admin/acceptance-preview', actionLimit, async (context) => {
    const parsed = dateRangeSchema.safeParse(await context.req.json())
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? '请求参数无效' }, 400)
    return context.json(await workflow.inspect({ type: 'acceptance', ...parsed.data, send: false }))
  })
  app.post('/api/admin/acceptance-send', actionLimit, async (context) => {
    const parsed = sendPreviewSchema.safeParse(await context.req.json())
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? '缺少明确确认' }, 400)
    return context.json(await workflow.sendPreview(parsed.data.previewId))
  })
  app.post('/api/admin/previews/:id/resend', actionLimit, async (context) => {
    const id = previewIdSchema.safeParse(context.req.param('id'))
    const body = resendPreviewSchema.safeParse(await context.req.json())
    if (!id.success || !body.success) return context.json({ error: '复核记录或确认信息无效' }, 400)
    return context.json({ message: '复核结果已再次发送至 POPO', messageTaskId: await workflow.resendPreview(id.data) })
  })
}
