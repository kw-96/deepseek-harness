import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { GcpWebhookHandler } from './handler.js'
import type { WebhookRequestLog } from './log.js'
import { installWebhookRoute } from './route.js'

/** 独立事件入口的监听参数。 */
export interface WebhookIngressOptions {
  host: string
  port: number
  token: string
  log: WebhookRequestLog
}

/** 已启动的独立事件入口。 */
export interface WebhookIngress {
  /** 实际绑定端口；传入 0 时由系统分配。 */
  port: number
  /** 停止监听并释放端口。 */
  close: () => Promise<void>
}

/**
 * 启动只服务易协作事件路径的独立入口，其余路径一律返回 404。
 * 该入口独立于宿主 Web 服务，供内网中的易协作网关回调。
 * @param webhook 事件处理器
 * @param options 监听地址、端口与入口令牌
 * @returns 实际端口与关闭函数
 */
export function startWebhookIngress(webhook: GcpWebhookHandler, options: WebhookIngressOptions): Promise<WebhookIngress> {
  const app = new Hono()
  installWebhookRoute(app, options.token, webhook, options.log, 'ingress')
  app.notFound((context) => context.json({ error: '入口不存在' }, 404))
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, hostname: options.host, port: options.port }, (info) => {
      resolve({
        port: info.port,
        close: (): Promise<void> => new Promise<void>((done) => {
          server.close(() => done())
        }),
      })
    })
    server.on('error', reject)
  })
}
