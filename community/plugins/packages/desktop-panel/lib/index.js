/**
 * DSH 桌面面板插件（host 侧）。
 *
 * 职责：
 *  - 提供面板页面 `/plugin/desktop`（自包含 HTML，手机浏览器可直接打开）
 *  - 提供 `/plugin/desktop/info` 供页面获取访问信息
 *  - 提供 `/plugin/desktop/state`（读）与 `/plugin/desktop/enabled`（写）供设置页卡片控制启停
 *  - 提供 WebSocket 升级路由 `/plugin/desktop/stream`，带 token 校验后与本机命名管道
 *    `\\.\pipe\dsh-desktop` 双向透传；管道另一端是运行在控制台会话输入桌面上的 SYSTEM worker
 *
 * 说明：webserver 的升级路由本身不做鉴权，因此这里必须自行校验 token（见 packages/host/webserver）。
 */
import { randomUUID } from 'node:crypto'
import { exec } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { acceptWebSocket } from './ws.js'
import { renderPanel } from './panel.js'

/** Cordis 插件名。 */
export const name = 'desktop-panel'

/** 需要 webServer 提供 HTTP/升级路由能力。 */
export const inject = ['webServer']

const PIPE_PATH = '\\\\.\\pipe\\dsh-desktop'
const PAGE_PATH = '/plugin/desktop'
const INFO_PATH = '/plugin/desktop/info'
const STATE_PATH = '/plugin/desktop/state'
const ENABLED_PATH = '/plugin/desktop/enabled'
const STREAM_PATH = '/plugin/desktop/stream'
/** 启用状态的持久化位置（与 native worker 同目录）。 */
const STATE_DIR = 'C:\\ProgramData\\dsh-desktop-panel'
const STATE_FILE = join(STATE_DIR, 'panel-state.json')
/** worker 输入包类型（与 C# 侧一致：1=帧 2=输入 3=日志）。 */
const INPUT_TYPE = 2

/** 读取持久化的启用状态；缺失或损坏时默认启用。 */
function readEnabled() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    return parsed.enabled !== false
  } catch {
    return true
  }
}

/** 持久化启用状态。 */
function writeEnabled(enabled) {
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(STATE_FILE, JSON.stringify({ enabled }, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

/**
 * 查询桌面 worker 是否在运行。
 * 注意：不能靠连接命名管道来判断——worker 目前只接受一个连接，探测会把用户的面板挤掉。
 * @returns {Promise<boolean>} 进程存在时为 true
 */
function workerRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq DeskWorker.exe" /NH', { windowsHide: true }, (error, stdout) => {
      resolve(error === null && typeof stdout === 'string' && stdout.includes('DeskWorker.exe'))
    })
  })
}

/** 统一的 JSON 响应。 */
function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** 面板停用时的提示页。 */
function renderDisabled() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>桌面面板已停用</title>
<style>body{margin:0;background:#14161a;color:#e6e8eb;font:14px/1.7 "Microsoft YaHei",system-ui,sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh}p{color:#9aa3ad}</style></head>
<body><div><h2>桌面面板已停用</h2><p>可在「设置 → 插件 → 插件配置 → 桌面面板」中重新启用。</p></div></body></html>`
}

/**
 * 注册面板页面、信息接口、状态接口与 WebSocket 流。
 * @param {import('@deepseek-ai/cordis').Context} ctx Cordis 上下文
 */
export function apply(ctx) {
  const token = randomUUID()
  const connections = new Set()
  const log = (message) => { console.log(`[desktop-panel] ${message}`) }
  let enabled = readEnabled()

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: PAGE_PATH,
    handler: (req, res) => {
      if (!enabled) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(renderDisabled())
        return
      }
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
      sendJson(res, 200, { pipe: PIPE_PATH, page: PAGE_PATH, stream: STREAM_PATH, enabled })
    },
  }), 'desktop-panel.info')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: STATE_PATH,
    handler: (req, res) => {
      const host = typeof req.headers.host === 'string' ? req.headers.host : ''
      workerRunning().then((running) => {
        sendJson(res, 200, {
          id: 'dsh-desktop-panel',
          title: '桌面面板',
          description: '在浏览器里查看并操作本机桌面（含锁屏画面）',
          enabled,
          path: PAGE_PATH,
          url: host === '' ? PAGE_PATH : `http://${host}${PAGE_PATH}`,
          pipe: PIPE_PATH,
          workerRunning: running,
        })
      }).catch(() => {
        sendJson(res, 200, { id: 'dsh-desktop-panel', enabled, path: PAGE_PATH, url: PAGE_PATH, workerRunning: false })
      })
    },
  }), 'desktop-panel.state')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ENABLED_PATH,
    handler: (req, res) => {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'method not allowed' }); return }
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        let parsed
        try {
          parsed = JSON.parse(body === '' ? '{}' : body)
        } catch {
          sendJson(res, 400, { error: 'invalid json' })
          return
        }
        enabled = parsed.enabled === true
        const persisted = writeEnabled(enabled)
        log(`面板已${enabled ? '启用' : '停用'}（持久化=${persisted}）`)
        if (!enabled) { for (const cleanup of [...connections]) cleanup() }
        sendJson(res, 200, { enabled, persisted })
      })
    },
  }), 'desktop-panel.enabled')

  ctx.effect(() => ctx.webServer.registerUpgrade({
    path: STREAM_PATH,
    handler: (req, socket, head) => {
      let provided = ''
      try {
        provided = new URL(req.url ?? '', 'http://localhost').searchParams.get('token') ?? ''
      } catch {
        provided = ''
      }
      if (!enabled || provided !== token) {
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
