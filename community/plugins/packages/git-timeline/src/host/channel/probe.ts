/**
 * 通道探测：真实发起 TLS 连接并索取 HTTP 响应，判断 HTTPS 通道是否可用。
 *
 * 这里刻意不复用「连得上 TCP」这类近似判断：实测本机到 github.com 的
 * TCP 与 TLS 握手都能完成，但应用数据被中断，只有真正拿到响应首行才能
 * 说明这条通道能承载 git 的请求。
 */

import { connect } from 'node:tls'
import { connect as tcpConnect } from 'node:net'
import { resolve4 } from 'node:dns/promises'
import type { HttpsChannel, SshChannel } from './types.js'

/** 单次探测的整体上限。 */
const PROBE_TIMEOUT_MS = 8000

/** GitHub 的 git 端点专用域名。 */
const GIT_HOST = 'github.com'

/** GitHub 的 SSH 备用入口。 */
const SSH_ALT_HOST = 'ssh.github.com'

/** 判断是不是地址字面量（IPv4 或含冒号的 IPv6）。 */
function isIpLiteral(value: string): boolean {
  if (value.includes(':')) return true
  const parts = value.split('.')
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part))
}

/**
 * 探测一个 HTTPS 端点：TLS 握手 + 索取响应首行。
 * @param host 请求的域名（同时作为 TLS SNI，仅当它不是地址字面量时）
 * @param ip 目标地址；为 null 时使用系统解析
 * @param timeoutMs 超时
 * @returns 探测结果
 */
export function probeHttps(host: string, ip: string | null, timeoutMs = PROBE_TIMEOUT_MS): Promise<HttpsChannel> {
  return new Promise<HttpsChannel>((resolve) => {
    const started = Date.now()
    const state: HttpsChannel = { tlsOk: false, httpOk: false, status: null, latencyMs: null, error: null }
    let settled = false
    // SNI 必须是域名：传地址字面量会被 Node 忽略并告警（RFC 6066 不允许）。
    const socket = connect({ host: ip ?? host, port: 443, servername: isIpLiteral(host) ? undefined : host })
    const finish = (): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(state)
    }
    socket.setTimeout(timeoutMs)
    socket.once('secureConnect', () => {
      state.tlsOk = true
      state.latencyMs = Date.now() - started
      socket.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: dsh-git-timeline\r\nConnection: close\r\n\r\n`)
    })
    socket.on('data', (chunk: Buffer) => {
      if (state.httpOk) return
      state.status = chunk.toString('utf8').split('\r\n')[0] ?? ''
      state.httpOk = true
      finish()
    })
    socket.once('timeout', () => { state.error = 'timeout'; finish() })
    socket.once('error', (error: NodeJS.ErrnoException) => { state.error = error.code ?? error.message; finish() })
    socket.once('end', () => { finish() })
  })
}

/**
 * 探测 git 端点：逐个人工解析出的地址真发请求。
 *
 * 逐个地址而不是只试系统解析结果：实测系统解析给出的地址可能整段不可达，
 * 而其它地址可用，只测一个会把可用通道误判为不可用。
 * @param timeoutMs 单地址超时
 * @returns 任一地址拿到响应即算通道可用
 */
export async function probeGitHttps(timeoutMs = PROBE_TIMEOUT_MS): Promise<HttpsChannel> {
  const addresses = await resolveAddresses(GIT_HOST)
  const targets: readonly (string | null)[] = addresses.length === 0 ? [null] : [...addresses]
  let last: HttpsChannel = { tlsOk: false, httpOk: false, status: null, latencyMs: null, error: 'no-address' }
  for (const ip of targets) {
    const result = await probeHttps(GIT_HOST, ip, timeoutMs)
    if (result.httpOk) return result
    // 保留"走到 TLS 但拿不到响应"这一最有信息量的失败形态。
    if (result.tlsOk) last = result
    else if (last.error === 'no-address') last = result
  }
  return last
}

/** 解析 A 记录；失败返回空数组。 */
async function resolveAddresses(host: string): Promise<readonly string[]> {
  try {
    return await resolve4(host)
  } catch {
    return []
  }
}

/** 探测一个地址的 TCP 端口。 */
function probePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = tcpConnect({ host, port })
    let settled = false
    const finish = (value: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => { finish(true) })
    socket.once('timeout', () => { finish(false) })
    socket.once('error', () => { finish(false) })
  })
}

/**
 * 探测 SSH 通道：直连 22 端口与经 443 端口的备用入口。
 * @param timeoutMs 单端口超时
 * @returns 两个端口的可达性
 */
export async function probeSsh(timeoutMs = 5000): Promise<SshChannel> {
  const [port22, port443] = await Promise.all([
    probePort(GIT_HOST, 22, timeoutMs),
    probePort(SSH_ALT_HOST, 443, timeoutMs),
  ])
  return { port22, port443 }
}
