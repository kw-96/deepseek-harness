import type { Hono } from 'hono'
import type { GcpWebhookHandler } from './handler.js'
import { previewBody, type WebhookRequestLog } from './log.js'

/** 事件请求体上限，超过即拒绝，避免无界读取。 */
const MAX_BODY_BYTES = 256_000

/** 承载回调的路径来源。 */
export type WebhookSource = 'host' | 'ingress'

/**
 * 注册易协作事件接收路由；宿主前缀与独立入口共用同一契约。
 * 每次回调都写入入口记录，被拒绝的请求同样留痕以便诊断。
 * @param app 目标 Hono 应用
 * @param token 入口令牌，构成路径最后一段
 * @param webhook 事件处理器
 * @param log 入口回调记录
 * @param source 当前承载路径的来源标记
 */
export function installWebhookRoute(
  app: Hono,
  token: string,
  webhook: GcpWebhookHandler,
  log: WebhookRequestLog,
  source: WebhookSource,
): void {
  app.post(`/webhooks/gcp/${token}`, async (context) => {
    const length = Number(context.req.header('content-length') ?? 0)
    if (length > MAX_BODY_BYTES) {
      log.record({ source, outcome: 'invalid', reason: '请求体过大', module: '', event: '', domain: '', bodyPreview: '' })
      return context.json({ error: '请求体过大' }, 413)
    }
    const raw = await context.req.text().catch(() => '')
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      log.record({
        source, outcome: 'invalid', reason: '请求体不是合法 JSON',
        module: '', event: '', domain: '', bodyPreview: previewBody(raw),
      })
      return context.json({ error: '请求内容无效' }, 400)
    }
    const result = webhook.accept(payload)
    log.record({
      source,
      outcome: result.accepted ? (result.duplicate ? 'duplicate' : 'accepted') : 'ignored',
      reason: result.reason,
      module: result.module,
      event: result.event,
      domain: result.domain,
      ...(result.issueId === undefined ? {} : { issueId: result.issueId }),
      ...(result.projectId === undefined ? {} : { projectId: result.projectId }),
      bodyPreview: previewBody(raw),
    })
    return context.json({
      accepted: result.accepted,
      duplicate: result.duplicate,
      ...(result.issueId === undefined ? {} : { issueId: result.issueId }),
    })
  })
}
