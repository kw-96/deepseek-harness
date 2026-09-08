import { join } from 'node:path'
import { Hono } from 'hono'
import type { AppConfig } from './config.js'
import { todayInShanghai } from './domain/dates.js'
import { toAdminIssue } from './plugins/admin/issues.js'
import { adminPage } from './plugins/admin/page.js'
import { createRateLimit } from './plugins/admin/rateLimit.js'
import { dateRangeSchema, issueIdSchema, messageIdSchema, previewIdSchema, resendPreviewSchema, resumeMessageSchema, runtimeSettingsSchema, sendPreviewSchema, statsQuerySchema } from './plugins/admin/validation.js'
import { GcpClient } from './plugins/gcp/client.js'
import { GcpIssueService } from './plugins/gcp/service.js'
import { PopoClient } from './plugins/popo/client.js'
import { PopoDeliveryService } from './plugins/popo/delivery.js'
import { startScheduler } from './plugins/scheduler/scheduler.js'
import { WorkorderStatsService } from './plugins/stats/service.js'
import { WorkorderStore } from './plugins/store/store.js'
import { GcpWebhookHandler } from './plugins/webhook/handler.js'
import { InspectionWorkflow } from './plugins/workflow/service.js'
import type { WorkorderAgentRouter } from './harness/agent.js'

export interface AppRuntime {
  app: Hono
  close: () => Promise<void>
}

/** 创建完整业务运行时及内部管理 API。 */
export async function createApp(config: AppConfig, agentRouter?: WorkorderAgentRouter): Promise<AppRuntime> {
  const gcp = new GcpClient(config.gcp)
  await gcp.connect()
  const store = new WorkorderStore(join(config.dataDir, 'db', 'workorder-agent.sqlite'))
  const issues = new GcpIssueService(gcp, config.projects, config.completedStatusId, store.issues)
  const delivery = new PopoDeliveryService(store, new PopoClient(config.popo.url, config.popo.secret))
  const workflow = new InspectionWorkflow(issues, store, delivery, config.gcp.host)
  const stats = new WorkorderStatsService(store)
  const webhook = new GcpWebhookHandler(store, gcp, config.projects, config.gcp.host, agentRouter)
  webhook.start()
  const stopScheduler = startScheduler(workflow, store)
  const app = new Hono()
  app.onError((error, context) => {
    console.error('管理接口处理失败', error)
    return context.json({ error: error instanceof Error ? error.message : '服务处理请求失败' }, 500)
  })
  const authorize = (value?: string): boolean => value === `Bearer ${config.adminToken}`
  const adminLimit = createRateLimit(30, 60_000)
  const actionLimit = createRateLimit(5, 60_000)

  app.get('/', (context) => context.html(adminPage()))
  app.get('/health', (context) => context.json({ healthy: true }))
  app.get('/readiness', (context) => {
    const database = store.health()
    const components = { database, mcp: gcp.isReady(), webhook: webhook.isReady() }
    const ready = database.ready && components.mcp && components.webhook
    return context.json({ ready, ...components }, ready ? 200 : 503)
  })
  app.use('/api/admin/*', adminLimit)
  app.use('/api/admin/*', async (context, next) => {
    if (!authorize(context.req.header('authorization'))) return context.json({ error: '未授权' }, 401)
    await next()
  })
  app.get('/api/admin/status', (context) => context.json({
    healthy: store.health().ready && gcp.isReady() && webhook.isReady(),
    settings: {
      scheduleEnabled: store.getFlag('schedule_enabled'),
      automaticSendEnabled: store.getFlag('automatic_send_enabled'),
      webhookProcessingEnabled: store.getFlag('webhook_processing_enabled'),
    },
    configured: {
      gcpUserKey: Boolean(config.gcp.userKey), popoWebhook: Boolean(config.popo.url),
      webhookEntry: Boolean(config.webhookToken), adminToken: Boolean(config.adminToken),
    },
    projects: config.projects,
    completedStatusId: config.completedStatusId,
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
    const keys = {
      scheduleEnabled: 'schedule_enabled', automaticSendEnabled: 'automatic_send_enabled',
      webhookProcessingEnabled: 'webhook_processing_enabled',
    } as const
    for (const [name, value] of Object.entries(parsed.data)) {
      if (value !== undefined) store.setFlag(keys[name as keyof typeof keys], value, 'admin-ui')
    }
    store.appendAudit({ category: 'settings', action: 'updated', subject: 'runtime', detail: parsed.data, actor: 'admin-ui' })
    return context.json({ message: '运行设置已保存' })
  })
  app.get('/api/admin/issues', (context) => {
    const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 200), 1), 500)
    return context.json({
      items: store.issues.list(limit).map((item) => toAdminIssue(item, config.gcp.host)),
      total: store.issues.count(),
    })
  })
  app.get('/api/admin/issues/:id', (context) => {
    const parsed = issueIdSchema.safeParse(context.req.param('id'))
    if (!parsed.success) return context.json({ error: '工单标识无效' }, 400)
    const issue = store.issues.get(parsed.data)
    return issue ? context.json(toAdminIssue(issue, config.gcp.host)) : context.json({ error: '工单不存在' }, 404)
  })
  app.get('/api/admin/stats', (context) => {
    const parsed = statsQuerySchema.safeParse({ startDate: context.req.query('startDate'), endDate: context.req.query('endDate') })
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? '统计查询参数无效' }, 400)
    return context.json(stats.compute(parsed.data.startDate, parsed.data.endDate))
  })
  app.get('/api/admin/popo/capabilities', (context) => context.json({
    configured: Boolean(config.popo.url), signed: Boolean(config.popo.secret), available: store.health().ready,
    features: { chunking: true, chunkTracking: true, resumeFailed: true, fullResend: true,
      recall: false },
    recallReason: '自定义群机器人 Webhook 未提供已授权的撤回能力',
  }))
  app.get('/api/admin/popo/messages', (context) => {
    const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 30), 1), 100)
    const status = context.req.query('status') || undefined
    return context.json({ items: store.messages.list(limit, status) })
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
    try {
      return context.json({ message: 'POPO 消息已从失败分段继续发送', ...(await delivery.resume(id.data)) })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      if (detail.includes('不可续发') || detail.includes('已经全部发送')) return context.json({ error: detail }, 409)
      throw error
    }
  })
  app.post('/api/admin/test-notification', actionLimit, async (context) => {
    const messageTaskId = await workflow.sendTestNotification()
    return context.json({ message: '固定测试通知已发送', messageTaskId })
  })
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
    const messageTaskId = await workflow.resendPreview(id.data)
    return context.json({ message: '复核结果已再次发送至 POPO', messageTaskId })
  })
  app.post(`/webhooks/gcp/${config.webhookToken}`, async (context) => {
    const length = Number(context.req.header('content-length') ?? 0)
    if (length > 256_000) return context.json({ error: '请求体过大' }, 413)
    return context.json(webhook.accept(await context.req.json()))
  })
  const close = async (): Promise<void> => {
    stopScheduler()
    webhook.stop()
    store.close()
    await gcp.close()
  }
  return { app, close }
}
