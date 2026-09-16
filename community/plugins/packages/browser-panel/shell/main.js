/**
 * DeepSeek Harness — desktop shell.
 *
 * Two jobs:
 *
 *  1. Give the browser pane a REAL embedded browsing context. The harness UI is
 *     a web page, and a page cannot embed one: sites send
 *     `X-Frame-Options: SAMEORIGIN` so an iframe is refused, and `SameSite=Lax`
 *     withholds cookies from a cross-site frame anyway. Loaded here it gains
 *     `<webview>`, which is a genuine browsing context with its own process and
 *     session. The plugin feature-detects this and falls back to its CDP stream
 *     in a plain tab, so the shell is strictly an upgrade.
 *
 *  2. Let one window point at more than one harness. A harness may be on this
 *     machine or on another one; the shell is only a viewer, so switching is
 *     "reload against a different URL" plus whatever command the user needs run
 *     first to make that URL reachable.
 *
 * The window is a BaseWindow holding two views: a thin strip the shell owns,
 * and the harness below it. The harness page is never modified or injected
 * into -- it belongs to the harness, and a shell that rewrote it would break
 * on every harness update.
 *
 * The shell does NOT start or manage the harness server itself. That stays a
 * separate concern, so this window can be closed or skipped without touching it.
 */

import { app, BaseWindow, WebContentsView, shell, dialog, ipcMain, Menu, session } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as connections from './connections.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STRIP_H = 26
const WAIT_MS = 40000

let win = null
let strip = null
let content = null
let preTask = null          // the running preConnect child, if any
let cfg = connections.load()
let status = { status: 'idle', message: '' }

// ── helpers ──────────────────────────────────────────────────────────────────

const active = () => cfg.connections.find((c) => c.id === cfg.active) || cfg.connections[0] || null

/** Is something answering at this URL yet? */
async function answers(url, ms = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) })
    return res.ok || res.status < 500
  } catch {
    return false
  }
}

function pushState(patch) {
  if (patch) status = { ...status, ...patch }
  const state = { active: cfg.active, connections: cfg.connections, ...status }
  try { strip?.webContents.send('shell:state', state) } catch { /* not ready */ }
  return state
}

function setTitle(conn) {
  try { win?.setTitle(conn ? `DeepSeek Harness — ${conn.name}` : 'DeepSeek Harness') } catch { /* ignore */ }
}

/** Stop a preConnect command from a previous connection. */
function stopPreTask() {
  if (!preTask) return
  const t = preTask
  preTask = null
  try {
    // The command is usually a tunnel that spawns its own children, so kill the
    // process group where the platform has one.
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(t.pid), '/f', '/t'], { stdio: 'ignore' })
    else t.kill('SIGTERM')
  } catch { /* already gone */ }
}

/**
 * Run a connection's preConnect command, if it has one.
 *
 * The shell has no idea what the command does -- ssh tunnel, VPN script,
 * port-forward. It runs it, then waits for the URL to answer. That is the whole
 * contract, and it is why this works the same on every platform.
 */
function startPreTask(conn) {
  if (!conn.preConnect) return
  const sh = process.platform === 'win32'
    ? { cmd: 'cmd.exe', args: ['/c', conn.preConnect] }
    : { cmd: '/bin/sh', args: ['-c', conn.preConnect] }
  preTask = spawn(sh.cmd, sh.args, { stdio: 'ignore', detached: process.platform !== 'win32' })
  preTask.on('error', () => { preTask = null })
}

// ── connecting ───────────────────────────────────────────────────────────────

async function connectTo(id) {
  const conn = cfg.connections.find((c) => c.id === id)
  if (!conn) return

  stopPreTask()
  cfg.active = conn.id
  connections.saveActive(conn.id)
  setTitle(conn)
  pushState({ status: 'connecting', message: conn.preConnect ? 'starting connection…' : 'connecting…' })

  // Already reachable? Then skip the command entirely -- a tunnel the user
  // started by hand is just as good as one we started, and starting a second
  // would collide on the port.
  if (!(await answers(conn.url))) {
    startPreTask(conn)
    const deadline = Date.now() + WAIT_MS
    let up = false
    while (Date.now() < deadline) {
      if (await answers(conn.url, 1500)) { up = true; break }
      if (conn.preConnect && preTask === null) break     // command died
      await new Promise((r) => setTimeout(r, 700))
    }
    if (!up) {
      pushState({ status: 'failed', message: 'not answering' })
      dialog.showMessageBox({
        type: 'warning',
        buttons: ['OK'],
        title: 'DeepSeek Harness',
        message: `Could not reach “${conn.name}”.`,
        detail: `Nothing is answering at ${conn.url}.\n\n`
          + (conn.local
            ? 'Start the harness on this machine, then try again.'
            : 'Check the other machine is awake and its harness is running.'),
      })
      return
    }
  }

  pushState({ status: 'connected', message: '' })
  content.webContents.loadURL(conn.url)
}

// ── window ───────────────────────────────────────────────────────────────────

function layout() {
  if (!win) return
  const { width, height } = win.getContentBounds()
  const stripH = status.expanded || STRIP_H
  strip.setBounds({ x: 0, y: 0, width, height: stripH })
  content.setBounds({ x: 0, y: STRIP_H, width, height: Math.max(0, height - STRIP_H) })
}

function createWindow() {
  win = new BaseWindow({
    width: 1500, height: 950, minWidth: 900, minHeight: 600,
    backgroundColor: '#16181d',
    title: 'DeepSeek Harness',
    autoHideMenuBar: true,
  })

  content = new WebContentsView({
    webPreferences: {
      // The reason this shell exists.
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      spellcheck: true,
    },
  })

  strip = new WebContentsView({
    webPreferences: {
      preload: path.join(HERE, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // content first, strip second: the strip must paint OVER the harness when its
  // dropdown is open.
  win.contentView.addChildView(content)
  win.contentView.addChildView(strip)

  strip.webContents.loadFile(path.join(HERE, 'strip.html'))
  win.on('resize', layout)
  layout()

  // Links meant for a new window go to the user's real browser rather than
  // spawning bare Electron windows with no chrome.
  const external = ({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  }
  content.webContents.setWindowOpenHandler(external)
  app.on('web-contents-created', (_e, wc) => {
    if (wc.getType() === 'webview') wc.setWindowOpenHandler(external)
  })

  win.on('closed', () => { stopPreTask(); win = null })
  return win
}

// ── downloads ────────────────────────────────────────────────────────────────

/**
 * Save files the user asks for.
 *
 * Without this a download from the harness -- or from a page in the browser
 * pane -- goes nowhere the user can see, which is worse than it failing. It
 * matters most when the harness is on ANOTHER machine: the file lives over
 * there, and this is the only way it reaches the machine being sat at.
 */
function onDownload(_e, item) {
  // Behave like a browser: straight to Downloads, no save dialog. Electron's
  // default is to prompt for every file, which is a lot of friction for the
  // common case of "the agent made me a file, give it to me".
  try {
    const dir = app.getPath('downloads')
    const name = item.getFilename() || 'download'
    const ext = path.extname(name)
    const stem = ext ? name.slice(0, -ext.length) : name
    // Never silently overwrite: a second copy becomes "report (1).md".
    let target = path.join(dir, name)
    for (let n = 1; existsSync(target) && n < 1000; n++) target = path.join(dir, `${stem} (${n})${ext}`)
    item.setSavePath(target)
  } catch {
    // Fall through to Electron's save dialog rather than losing the download.
  }
}

function wireDownloads() {
  // Covers partitions created later, e.g. the browser pane's persistent session.
  app.on('session-created', (sess) => {
    try { sess.on('will-download', onDownload) } catch { /* ignore */ }
  })
  // ...and the default session, which already exists and never fires that event.
  try { session.defaultSession.on('will-download', onDownload) } catch { /* ignore */ }
}

// ── menu ─────────────────────────────────────────────────────────────────────

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const connectItems = cfg.connections.map((c, i) => ({
    label: c.name,
    type: 'radio',
    checked: c.id === cfg.active,
    accelerator: i < 9 ? `CmdOrCtrl+${i + 1}` : undefined,
    click: () => connectTo(c.id),
  }))

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'Connect',
      submenu: [
        ...connectItems,
        { type: 'separator' },
        {
          label: 'Reconnect',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => connectTo(cfg.active),
        },
        {
          label: 'Edit Connections…',
          click: () => shell.openPath(connections.configPath),
        },
        {
          label: 'Reload Connections',
          click: () => { cfg = connections.load(); buildMenu(); pushState() },
        },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── ipc ──────────────────────────────────────────────────────────────────────

ipcMain.handle('shell:state', () => pushState())
ipcMain.handle('shell:connect', (_e, id) => { connectTo(id); buildMenu() })
ipcMain.handle('shell:expand', (_e, expanded, height) => {
  status.expanded = expanded ? Math.max(STRIP_H, Math.round(height)) : 0
  layout()
})

// ── boot ─────────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  wireDownloads()
  createWindow()
  buildMenu()

  const start = active()
  if (!start) {
    dialog.showErrorBox('DeepSeek Harness', 'No connections are configured.')
    app.quit()
    return
  }
  await connectTo(start.id)

  app.on('activate', () => { if (!win) { createWindow(); buildMenu() } })
})

app.on('will-quit', () => stopPreTask())

app.on('window-all-closed', () => {
  // Closing the shell must not stop a harness; it is a separate process and may
  // well be in use from a normal browser tab.
  if (process.platform !== 'darwin') app.quit()
})
