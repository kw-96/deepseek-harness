import type { MiddlewareHandler } from 'hono'

interface Bucket {
  count: number
  resetAt: number
}

/** 创建单进程固定窗口基础限流中间件。 */
export function createRateLimit(maxRequests: number, windowMs: number): MiddlewareHandler {
  const buckets = new Map<string, Bucket>()
  return async (context, next): Promise<Response | void> => {
    const key = context.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    const now = Date.now()
    const current = buckets.get(key)
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
    bucket.count += 1
    buckets.set(key, bucket)
    if (bucket.count > maxRequests) {
      context.header('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      return context.json({ error: '请求过于频繁，请稍后重试' }, 429)
    }
    await next()
  }
}
