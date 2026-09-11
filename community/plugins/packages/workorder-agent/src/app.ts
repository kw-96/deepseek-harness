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
import { VivoService } from './plugins/vivo/service.js'
import { GcpWebhookHandler } from './plugins/webhook/handler.js'
import { startWebhookIngress, type WebhookIngress } from './plugins/webhook/ingress.js'
import { WebhookRequestLog } from './plugins/webhook/log.js'
import { installWebhookRoute } from './plugins/webhook/route.js'
import { IssueReviewWorkflow } from './plugins/workflow/review.js'
import { InspectionWorkflow } from './plugins/workflow/service.js'

export interface AppRuntime {
  app: Hono
  close: () => Promise<void>
}

/**
 * 按配置启动独立事件入口；启动失败只记录并继续，不影响控制面。
 * @param config 业务运行配置
 * @param webhook 事件处理器
 * @param log 入口回调记录
 * @returns 已启动的入口，未启用或启动失败时为 undefined
 */
async function startIngress(config: AppConfig, webhook: GcpWebhookHandler, log: WebhookRequestLog): Promise<WebhookIngress | undefined> {
  if (!config.webhookIngress.enabled) return undefined
  const { host, port } = config.webhookIngress
  try {
    const ingress = await startWebhookIngress(webhook, { host, port, token: config.webhookToken, log })
    console.log(`易协作事件入口已监听：http://${host}:${ingress.port}/webhooks/gcp/<令牌>`)
    return ingress
  } catch (error) {
    console.error(`易协作事件入口监听失败（${host}:${port}）：`, error)
    return undefined
  }
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
  const vivo = new VivoService(store, config.vivo, delivery)
  vivo.sync()
  const webhook = new GcpWebhookHandler(store, gcp, config.projects, config.gcp.host, review, config.completedStatusId)
  const webhookLog = new WebhookRequestLog()
  webhook.start()
  const ingress = await startIngress(config, webhook, webhookLog)
  const stopScheduler = startScheduler(workflow, store)
  const app = new Hono()
  app.onError((error, context) => {
    console.error('管理接口处理失败', error)
    return context.json({ error: error instanceof Error ? error.message : '服务处理请求失败' }, 500)
  })
  app.get('/', (context) => context.html(adminPage()))
  app.get('/health', (context) => context.json({ healthy: true }))
  app.get('/readiness', (context) => {
    const database = store.health()
    const components = { database, mcp: gcp.isReady(), webhook: webhook.isReady() }
    const ready = database.ready && components.mcp && components.webhook
    return context.json({ ready, ...components }, ready ? 200 : 503)
  })
  app.use('/api/admin/*', createRateLimit(30, 60_000))
  installAdminRoutes(app, { config, store, issues, delivery, workflow, review, stats, vivo, webhookLog, agentRouter, writePluginSettings })
  installWebhookRoute(app, config.webhookToken, webhook, webhookLog, 'host')
  return {
    app,
    close: async (): Promise<void> => {
      stopScheduler()
      webhook.stop()
      await ingress?.close()
      store.close()
      await gcp.close()
    },
  }
}
