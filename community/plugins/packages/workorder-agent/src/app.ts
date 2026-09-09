import { join } from 'node:path'
import { Hono } from 'hono'
import type { AppConfig } from './config.js'
import type { WorkorderAgentRouter } from './harness/agent.js'
import { adminPage } from './plugins/admin/page.js'
import { installAdminRoutes, type PluginSettingsWrite } from './plugins/admin/routes.js'
import { createRateLimit } from './plugins/admin/rateLimit.js'
import { GcpClient } from './plugins/gcp/client.js'
import { GcpIssueService } from './plugins/gcp/service.js'
import { PopoClient } from './plugins/popo/client.js'
import { PopoDeliveryService } from './plugins/popo/delivery.js'
import { startScheduler } from './plugins/scheduler/scheduler.js'
import { WorkorderStatsService } from './plugins/stats/service.js'
import { WorkorderStore } from './plugins/store/store.js'
import { GcpWebhookHandler } from './plugins/webhook/handler.js'
import { IssueReviewWorkflow } from './plugins/workflow/review.js'
import { InspectionWorkflow } from './plugins/workflow/service.js'

export interface AppRuntime {
  app: Hono
  close: () => Promise<void>
}

/** 创建完整业务运行时及内部管理 API。 */
export async function createApp(
  config: AppConfig,
  agentRouter?: WorkorderAgentRouter,
  writePluginSettings?: PluginSettingsWrite,
): Promise<AppRuntime> {
  const gcp = new GcpClient(config.gcp)
  await gcp.connect()
  const store = new WorkorderStore(join(config.dataDir, 'db', 'workorder-agent.sqlite'))
  const issues = new GcpIssueService(gcp, config.projects, config.completedStatusId, store.issues)
  const delivery = new PopoDeliveryService(store, new PopoClient(config.popo.url, config.popo.secret))
  const workflow = new InspectionWorkflow(issues, store, delivery, config.gcp.host)
  const review = new IssueReviewWorkflow(store, delivery, config.gcp.host, config.review, agentRouter)
  const stats = new WorkorderStatsService(store)
  const webhook = new GcpWebhookHandler(store, gcp, config.projects, config.gcp.host, review)
  webhook.start()
  const stopScheduler = startScheduler(workflow, store)
  const app = new Hono()
  app.onError((error, context) => {
    console.error('管理接口处理失败', error)
    return context.json({ error: error instanceof Error ? error.message : '服务处理请求失败' }, 500)
  })
  const authorize = (value?: string): boolean => value === `Bearer ${config.adminToken}`
  app.get('/', (context) => context.html(adminPage()))
  app.get('/health', (context) => context.json({ healthy: true }))
  app.get('/readiness', (context) => {
    const database = store.health()
    const components = { database, mcp: gcp.isReady(), webhook: webhook.isReady() }
    const ready = database.ready && components.mcp && components.webhook
    return context.json({ ready, ...components }, ready ? 200 : 503)
  })
  app.use('/api/admin/*', createRateLimit(30, 60_000))
  app.use('/api/admin/*', async (context, next) => {
    if (!authorize(context.req.header('authorization'))) return context.json({ error: '未授权' }, 401)
    await next()
  })
  installAdminRoutes(app, { config, store, issues, delivery, workflow, review, stats, agentRouter, writePluginSettings })
  app.post(`/webhooks/gcp/${config.webhookToken}`, async (context) => {
    const length = Number(context.req.header('content-length') ?? 0)
    if (length > 256_000) return context.json({ error: '请求体过大' }, 413)
    return context.json(webhook.accept(await context.req.json()))
  })
  return {
    app,
    close: async (): Promise<void> => {
      stopScheduler()
      webhook.stop()
      store.close()
      await gcp.close()
    },
  }
}
