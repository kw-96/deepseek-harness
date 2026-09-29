import type { SendOptions } from './sender.js'

/** POPO 机器人应用客户端参数。 */
export interface PopoAppOptions {
  /** 开放平台地址，默认线上环境 */
  baseUrl?: string
  appId: string
  appSecret: string
  /** 默认接收人：用户邮箱或群 ID */
  receiver: string
}

export interface PopoAppSendResponse {
  msgId: string
}

/** 令牌提前刷新的余量，避免边界过期。 */
const REFRESH_MARGIN_MS = 60_000
const DEFAULT_BASE_URL = 'https://open.popo.netease.com'
/** text 类型正文上限（官方文档：3000 字符）。 */
export const MAX_TEXT_CHARACTERS = 3000

interface TokenPayload {
  errcode?: number
  errmsg?: string
  data?: { accessToken?: string; accessExpiredAt?: number | string }
}

interface SendPayload {
  errcode?: number
  errmsg?: string
  data?: { msgInfo?: Record<string, string> }
}

/**
 * 机器人应用通道：先用 App 凭证换取 accessToken，再以 Open-Access-Token 头发送文本消息。
 * 与自定义群机器人 Webhook 客户端接口一致，可直接替换。
 */
export class PopoAppClient {
  private token?: string
  private expiresAt = 0

  constructor(private readonly options: PopoAppOptions) {}

  /**
   * 发送单段文本；调用方保证正文不超过文本上限。
   * @param message 消息正文
   * @param options 本条消息的接收人，缺省用配置的默认接收人
   * @returns POPO 消息标识
   */
  async sendText(message: string, options: SendOptions = {}): Promise<PopoAppSendResponse> {
    if (!message) throw new Error('POPO 消息内容不能为空')
    const receiver = (options.receiver ?? '').trim() || this.options.receiver
    const accessToken = await this.accessToken()
    const payload = await this.post<SendPayload>('/open-apis/robots/v1/im/send-msg', {
      receiver,
      msgType: 'text',
      message: { content: message },
    }, accessToken)
    if (payload.errcode !== 0) throw new Error(describeError(payload.errcode, payload.errmsg))
    const msgId = payload.data?.msgInfo?.[receiver]
    if (!msgId) throw new Error('POPO 响应缺少消息标识')
    return { msgId }
  }

  /** 取 accessToken；未过期时复用缓存。 */
  private async accessToken(): Promise<string> {
    if (this.token !== undefined && Date.now() < this.expiresAt - REFRESH_MARGIN_MS) return this.token
    const payload = await this.post<TokenPayload>('/open-apis/robots/v1/token', {
      appId: this.options.appId,
      appSecret: this.options.appSecret,
    })
    if (payload.errcode !== 0 || !payload.data?.accessToken) {
      throw new Error(describeError(payload.errcode, payload.errmsg ?? '未返回 accessToken'))
    }
    this.token = payload.data.accessToken
    const expiresAt = Number(payload.data.accessExpiredAt ?? 0)
    this.expiresAt = Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : Date.now() + 3_600_000
    return this.token
  }

  private async post<T>(path: string, body: unknown, token?: string): Promise<T> {
    const base = this.options.baseUrl ?? DEFAULT_BASE_URL
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token === undefined ? {} : { 'Open-Access-Token': token }) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`POPO 请求失败：HTTP ${response.status}`)
    try {
      return await response.json() as T
    } catch (error) {
      throw new Error('POPO 返回了无法识别的响应', { cause: error })
    }
  }
}

/**
 * 把开放平台错误码翻译成可读中文。
 * @param errcode 错误码
 * @param errmsg 平台原始文案
 */
export function describeError(errcode: number | undefined, errmsg: string | undefined): string {
  const reason = errmsg?.trim() || '未知错误'
  switch (errcode) {
    case 65611:
      return `POPO 拒绝发送：接收人无法解析（${reason}）`
    case 65612:
      return `POPO 拒绝发送：机器人可见范围不含该接收人（${reason}）`
    case 65605:
      return `POPO 拒绝发送：不支持的消息类型（${reason}）`
    case 65338:
      return `POPO 拒绝发送：正文超出长度限制（${reason}）`
    default:
      return `POPO 返回错误：${reason}（errcode=${errcode ?? '未知'}）`
  }
}
