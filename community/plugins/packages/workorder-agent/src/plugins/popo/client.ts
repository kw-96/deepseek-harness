import { createHmac } from 'node:crypto'

export const TEST_NOTIFICATION = `【设计工单填写提醒】
K匡振威：
未填写总工时：[#49100](https://promoteart.pm.netease.com/v6/issues/49100)、[#49066](https://promoteart.pm.netease.com/v6/issues/49066)

请相关同学及时完善工单字段。`

export interface PopoSendResponse {
  msgId: string
}

/** POPO 自定义群机器人客户端。 */
export class PopoClient {
  constructor(private readonly url: string, private readonly secret?: string) {}

  /** 发送单段文本并返回 POPO 消息标识。 */
  async sendText(message: string): Promise<PopoSendResponse> {
    if (!message) throw new Error('POPO 消息内容不能为空')
    const body: Record<string, string> = { message }
    if (this.secret) {
      const timestamp = String(Date.now())
      body.timestamp = timestamp
      body.signData = createHmac('sha256', `${timestamp}\n${this.secret}`).digest('base64')
    }
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`POPO 请求失败：HTTP ${response.status}`)
    const text = await response.text()
    let result: { data?: { msgId?: string }; errcode?: number; errmsg?: string }
    try {
      result = JSON.parse(text) as typeof result
    } catch (error) {
      throw new Error('POPO 返回了无法识别的响应', { cause: error })
    }
    if (result.errcode !== 0) throw new Error(`POPO 返回错误：${result.errmsg ?? result.errcode ?? '未知错误'}`)
    if (!result.data?.msgId) throw new Error('POPO 响应缺少消息标识')
    return { msgId: result.data.msgId }
  }
}
