import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeError, PopoAppClient } from '../../src/plugins/popo/appClient.js'

interface Recorded {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

const TOKEN = { errcode: 0, errmsg: '成功', data: { accessToken: 'token-1', accessExpiredAt: Date.now() + 3_600_000 } }

/** 用可编程的假响应替换全局 fetch，并记录每次调用。 */
function stubFetch(responses: unknown[]): Recorded[] {
  const calls: Recorded[] = []
  let index = 0
  vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> })
    const payload = responses[Math.min(index, responses.length - 1)]
    index += 1
    return { ok: true, json: async () => payload }
  })
  return calls
}

const options = { baseUrl: 'https://popo.test', appId: 'app-1', appSecret: 'secret-1', receiver: 'a@corp.netease.com' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POPO 机器人应用客户端', () => {
  it('先取 token，再用 Open-Access-Token 头发送对象形态的 message', async () => {
    const calls = stubFetch([TOKEN, { errcode: 0, errmsg: 'ok', data: { msgInfo: { 'a@corp.netease.com': 'msg-1' } } }])
    const client = new PopoAppClient(options)
    await expect(client.sendText('测试正文')).resolves.toEqual({ msgId: 'msg-1' })

    expect(calls[0]?.url).toBe('https://popo.test/open-apis/robots/v1/token')
    expect(calls[0]?.body).toEqual({ appId: 'app-1', appSecret: 'secret-1' })
    expect(calls[1]?.url).toBe('https://popo.test/open-apis/robots/v1/im/send-msg')
    expect(calls[1]?.headers['Open-Access-Token']).toBe('token-1')
    expect(calls[1]?.body).toEqual({
      receiver: 'a@corp.netease.com',
      msgType: 'text',
      message: { content: '测试正文' },
    })
  })

  it('复用未过期的 token，并支持按消息覆盖接收人（单聊发给提单人）', async () => {
    const calls = stubFetch([
      TOKEN,
      { errcode: 0, data: { msgInfo: { 'a@corp.netease.com': 'm1' } } },
      { errcode: 0, data: { msgInfo: { 'b@corp.netease.com': 'm2' } } },
    ])
    const client = new PopoAppClient(options)
    await client.sendText('第一条')
    await client.sendText('第二条', { receiver: 'b@corp.netease.com' })
    expect(calls.filter((call) => call.url.endsWith('/token'))).toHaveLength(1)
    expect(calls[1]?.body).toMatchObject({ receiver: 'a@corp.netease.com', message: { content: '第一条' } })
    expect(calls[2]?.body).toMatchObject({ receiver: 'b@corp.netease.com', message: { content: '第二条' } })
    expect(calls[2]?.body.message).not.toHaveProperty('atUids')
  })

  it('token 过期后重新获取', async () => {
    const expired = { errcode: 0, data: { accessToken: 'old', accessExpiredAt: Date.now() - 1000 } }
    const fresh = { errcode: 0, data: { accessToken: 'new', accessExpiredAt: Date.now() + 3_600_000 } }
    const calls = stubFetch([expired, { errcode: 0, data: { msgInfo: { 'a@corp.netease.com': 'm1' } } }, fresh, { errcode: 0, data: { msgInfo: { 'a@corp.netease.com': 'm2' } } }])
    const client = new PopoAppClient(options)
    await client.sendText('第一条')
    await client.sendText('第二条')
    expect(calls.filter((call) => call.url.endsWith('/token'))).toHaveLength(2)
    expect(calls[3]?.headers['Open-Access-Token']).toBe('new')
  })

  it('把平台错误翻译为可读中文', async () => {
    expect(describeError(65612, 'robot has no visible for user')).toContain('可见范围')
    expect(describeError(65611, 'send msg not support')).toContain('无法解析')
    expect(describeError(65605, 'not support msg type')).toContain('消息类型')
    expect(describeError(65338, 'message length too long')).toContain('长度限制')
    expect(describeError(500, '服务繁忙, 请稍后再试')).toContain('服务繁忙')

    stubFetch([TOKEN, { errcode: 65612, errmsg: 'robot has no visible for user' }])
    const client = new PopoAppClient(options)
    await expect(client.sendText('正文')).rejects.toThrow('可见范围')
  })

  it('取 token 失败时抛出明确错误', async () => {
    stubFetch([{ errcode: 41000, errmsg: 'appSecret invalid' }])
    const client = new PopoAppClient(options)
    await expect(client.sendText('正文')).rejects.toThrow('appSecret invalid')
  })
})
