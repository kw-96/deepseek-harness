/**
 * DSH 桌面面板插件（host 侧）。
 *
 * 职责：
 *  - 提供面板页面 `/plugin/desktop`（自包含 HTML，手机浏览器可直接打开）
 *  - 提供 `/plugin/desktop/info` 供页面获取访问 token
 *  - 提供 WebSocket 升级路由 `/plugin/desktop/stream`，带 token 校验后与本机命名管道
 *    `\\.\pipe\dsh-desktop` 双向透传；管道另一端是运行在控制台会话输入桌面上的 SYSTEM worker
 *
 * 说明：webserver 的升级路由本身不做鉴权，因此这里必须自行校验 token（见 packages/host/webserver）。
 */
import { randomUUID } from 'node:crypto'
import { connect } from 'node:net'
import { acceptWebSocket } from './ws.js'
import { renderPanel } from './panel.js'

/** Cordis 插件名。 */
export const name = 'desktop-panel'

/** 需要 webServer 提供 HTTP/升级路由能力。 */
export const inject = ['webServer']

const PIPE_PATH = '\\\\.\\pipe\\dsh-desktop'
const PAGE_PATH = '/plugin/desktop'
const INFO_PATH = '/plugin/desktop/info'
const STREAM_PATH = '/plugin/desktop/stream'
/** worker 输入包类型（与 C# 侧一致：1=帧 2=输入 3=日志）。 */
const INPUT_TYPE = 2

/**
 * 注册面板页面、信息接口与 WebSocket 流。
 * @param {import('@deepseek-ai/cordis').Context} ctx Cordis 上下文
 */
export function apply(ctx) {
  const token = randomUUID()
  const connections = new Set()
  const log = (message) => { console.log(`[desktop-panel] ${message}`) }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: PAGE_PATH,
    handler: (req, res) => {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(renderPanel(token))
    },
  }), 'desktop-panel.page')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: INFO_PATH,
    handler: (req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(JSON.stringify({ pipe: PIPE_PATH, page: PAGE_PATH, stream: STREAM_PATH }))
    },
  }), 'desktop-panel.info')

  ctx.effect(() => ctx.webServer.registerUpgrade({
    path: STREAM_PATH,
    handler: (req, socket, head) => {
      let provided = ''
      try {
        provided = new URL(req.url ?? '', 'http://localhost').searchParams.get('token') ?? ''
      } catch {
        provided = ''
      }
      if (provided !== token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }

      let pipe = null
      let connection = null
      const cleanup = () => {
        if (pipe !== null) { const p = pipe; pipe = null; try { p.destroy() } catch { /* 已关闭 */ } }
        if (connection !== null) { const c = connection; connection = null; try { c.close() } catch { /* 已关闭 */ } }
        connections.delete(cleanup)
      }

      try {
        connection = acceptWebSocket(req, socket, head, (data) => {
          if (pipe === null) return
          const payload = Buffer.isBuffer(data) ? data : Buffer.from(data)
          const header = Buffer.alloc(8)
          header.writeInt32LE(payload.length, 0)
          header.writeInt32LE(INPUT_TYPE, 4)
          try { pipe.write(header); pipe.write(payload) } catch { cleanup() }
        }, cleanup)
      } catch (error) {
        log(`WebSocket 握手失败: ${error instanceof Error ? error.message : String(error)}`)
        socket.destroy()
        return
      }

      connections.add(cleanup)
      pipe = connect(PIPE_PATH)
      pipe.on('connect', () => log('worker 管道已连接'))
      // 管道是字节流：chunk 边界不等于包边界，必须按 8 字节头重组后再整包转发，
      // 否则浏览器会把半帧当成一帧解码（表现为画面花屏/无法解码）。
      let pending = Buffer.alloc(0)
      pipe.on('data', (chunk) => {
        pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk])
        for (;;) {
          if (pending.length < 8) return
          const length = pending.readInt32LE(0)
          if (length < 0 || length > 32 * 1024 * 1024) { log(`包长度异常: ${length}`); cleanup(); return }
          if (pending.length < 8 + length) return
          const packet = pending.subarray(0, 8 + length)
          pending = pending.subarray(8 + length)
          if (connection !== null && connection.isOpen()) connection.send(packet)
        }
      })
      pipe.on('error', (error) => { log(`管道错误: ${error.message}`); cleanup() })
      pipe.on('close', () => { log('worker 管道已关闭'); cleanup() })
    },
  }), 'desktop-panel.stream')
}
