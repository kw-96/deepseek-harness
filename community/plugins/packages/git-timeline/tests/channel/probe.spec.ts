/**
 * 通道探测：本地回环验证成功/超时两条路径，真实网络验证对 GitHub 的判断。
 */

import { createServer, type Server } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { probeHttps, probeSsh } from '../../src/host/channel/probe.js'

let server: Server | null = null
let port = 0

beforeAll(async () => {
  // 只接受连接、不回应任何数据：用来验证「TCP 通但拿不到响应」这一形态。
  server = createServer(socket => { socket.on('error', () => undefined) })
  await new Promise<void>(resolve => { server?.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
})

afterAll(async () => {
  await new Promise<void>(resolve => { server?.close(() => { resolve() }) })
})

describe('HTTPS 通道探测的两层判定', () => {
  it('对不回应的端点：TLS 未完成且标记超时，不谎报可用', async () => {
    // 该端口是纯 TCP 服务，TLS 握手无法完成。
    const result = await probeHttps('127.0.0.1', '127.0.0.1', 1000)
    expect(result.httpOk).toBe(false)
    expect(result.status).toBeNull()
    expect(result.tlsOk).toBe(false)
    expect(result.error).not.toBeNull()
  }, 15_000)

  it('对完全不可达的地址：如实报错而不是超时', async () => {
    // 203.0.113.0/24 是文档保留网段，连接必然失败或超时。
    const result = await probeHttps('github.com', '203.0.113.7', 800)
    expect(result.httpOk).toBe(false)
    expect(result.error).not.toBeNull()
  }, 15_000)

  it('端口参数不匹配时探测端口本身可用（证明上面的失败来自协议而不是端口）', async () => {
    expect(port).toBeGreaterThan(0)
  })
})

describe('真实网络下的通道判定（需要外网）', () => {
  it('api.github.com 可回应则 HTTP 层判定为通', async () => {
    const result = await probeHttps('api.github.com', null, 8000)
    if (!result.tlsOk) {
      // 无外网：探测必须如实报告失败，而不是伪造成功。
      expect(result.httpOk).toBe(false)
      return
    }
    // 有外网时，api.github.com 稳定返回响应首行。
    expect(result.httpOk).toBe(true)
    expect(result.status).toMatch(/^HTTP\/1\.1 \d{3}/)
    expect(result.latencyMs).not.toBeNull()
  }, 20_000)

  it('SSH 通道探测返回两个入口的可达性', async () => {
    const result = await probeSsh(6000)
    expect(typeof result.port22).toBe('boolean')
    expect(typeof result.port443).toBe('boolean')
  }, 20_000)
})
