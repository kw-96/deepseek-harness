import { afterEach, describe, expect, it, vi } from 'vitest'
import { PopoClient } from '../../src/plugins/popo/client.js'
import { splitPopoMessage } from '../../src/plugins/popo/messageChunks.js'

const originalFetch = globalThis.fetch

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('POPO 长消息分段', () => {
  it('短消息保持原样', () => {
    expect(splitPopoMessage('短消息')).toEqual(['短消息'])
  })

  it('长消息分段且不拆分 Markdown 工单链接', () => {
    const link = '[#49100](https://promoteart.pm.netease.com/v6/issues/49100)'
    const message = Array.from({ length: 600 }, (_, index) => `负责人${index}：${link}`).join('\n')
    const chunks = splitPopoMessage(message)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => byteLength(chunk) <= 4500)).toBe(true)
    expect(chunks.every((chunk) => [...chunk].length <= 2800)).toBe(true)
    expect(chunks.every((chunk) => !chunk.includes('[#49100]\n'))).toBe(true)
    expect(chunks.map((chunk) => chunk.replace(/^【消息分段 \d+\/\d+】\n/, '')).join('\n'))
      .toBe(message)
  })

  it('按 UTF-8 字节限制拆分中文消息', () => {
    const message = '待完善内容'.repeat(1000)
    const chunks = splitPopoMessage(message)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => byteLength(chunk) <= 4500)).toBe(true)
    expect(chunks.every((chunk) => [...chunk].length <= 2800)).toBe(true)
    expect(chunks.map((chunk) => chunk.replace(/^【消息分段 \d+\/\d+】\n/, '')).join(''))
      .toBe(message)
  })

  it('巡检消息按指派人独立发送并在跨段时重复上下文', () => {
    const link = (id: number): string => `[#${id}](https://example.com/v6/issues/${id})`
    const aliceIssues = Array.from({ length: 180 }, (_, index) => link(index + 1)).join('、')
    const bobIssues = Array.from({ length: 10 }, (_, index) => link(index + 1000)).join('、')
    const message = `【设计工单填写提醒｜2026-08-01至2026-08-02】\n` +
      `张三：\n未填写投放渠道：${aliceIssues}\n\n` +
      `李四：\n未填写总工时：${bobIssues}\n\n请相关同学及时完善工单字段。`
    const chunks = splitPopoMessage(message)
    const aliceChunks = chunks.filter((chunk) => chunk.includes('指派人：张三'))
    const bobChunks = chunks.filter((chunk) => chunk.includes('指派人：李四'))
    expect(aliceChunks.length).toBeGreaterThan(1)
    expect(bobChunks).toHaveLength(1)
    expect(chunks.every((chunk) => byteLength(chunk) <= 4500)).toBe(true)
    expect(chunks.every((chunk) => [...chunk].length <= 2800)).toBe(true)
    expect(chunks.every((chunk) => chunk.includes('【设计工单填写提醒'))).toBe(true)
    expect(chunks.every((chunk) => chunk.includes('请相关同学及时完善工单字段。'))).toBe(true)
    expect(chunks.every((chunk) => !(chunk.includes('指派人：张三') && chunk.includes('指派人：李四')))).toBe(true)
    expect(aliceChunks.every((chunk) => chunk.includes('未填写投放渠道：'))).toBe(true)
  })

  it('发送单段并返回远端消息标识', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      errcode: 0, data: { msgId: 'popo-message-id' },
    }), { status: 200 })) as typeof fetch
    await expect(new PopoClient('https://example.invalid/webhook').sendText('待完善内容'))
      .resolves.toEqual({ msgId: 'popo-message-id' })
  })

  it('远端响应缺少消息标识时明确失败', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ errcode: 0 }), {
      status: 200,
    })) as typeof fetch
    await expect(new PopoClient('https://example.invalid/webhook').sendText('待完善内容'))
      .rejects.toThrow('响应缺少消息标识')
  })
})
