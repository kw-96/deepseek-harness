/** 一次入口回调的诊断记录。 */
export interface WebhookRequestEntry {
  at: string
  /** 承载路径：宿主前缀内或独立入口。 */
  source: 'host' | 'ingress'
  outcome: 'accepted' | 'duplicate' | 'ignored' | 'invalid'
  reason: string
  module: string
  event: string
  domain: string
  issueId?: number
  projectId?: number
  /** 截断后的原始请求体，用于比对易协作真实载荷。 */
  bodyPreview: string
}

const MAX_ENTRIES = 50
const MAX_PREVIEW = 800

/**
 * 入口回调的有限内存记录：被拒绝的请求也留痕，便于区分「没到达」与「到了被忽略」。
 */
export class WebhookRequestLog {
  private readonly entries: WebhookRequestEntry[] = []

  /**
   * 追加一条记录，超出上限时丢弃最旧的一条。
   * @param entry 除时间戳外的记录内容
   */
  record(entry: Omit<WebhookRequestEntry, 'at'>): void {
    this.entries.push({ at: new Date().toISOString(), ...entry })
    if (this.entries.length > MAX_ENTRIES) this.entries.shift()
  }

  /** 返回最近的回调记录，最新的在前。 */
  list(): WebhookRequestEntry[] {
    return [...this.entries].reverse()
  }
}

/**
 * 生成请求体摘要；超长内容截断，非 JSON 原样保留。
 * @param raw 原始请求体文本
 * @returns 截断后的单行摘要
 */
export function previewBody(raw: string): string {
  const single = raw.replace(/\s+/g, ' ').trim()
  return single.length > MAX_PREVIEW ? `${single.slice(0, MAX_PREVIEW)}…` : single
}
