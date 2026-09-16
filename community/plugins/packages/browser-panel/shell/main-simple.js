/**
 * DeepSeek Harness — desktop shell.
 *
 * The harness UI is a web page served at http://127.0.0.1:3080. Loaded in an
 * ordinary browser tab, its browser pane can only ever *mirror* another browser:
 * a page cannot embed a real browsing context, sites send
 * `X-Frame-Options: SAMEORIGIN` so an iframe is refused, and `SameSite=Lax`
 * withholds cookies from a cross-site frame anyway.
 *
 * Loaded here, the same page gains `<webview>` — a genuine separate browsing
 * context with its own process and session. No framing, no mirroring, no
 * screencast. The plugin feature-detects this and uses it when present, falling
 * back to its CDP stream in a plain tab, so nothing about this shell is
 * required — it is strictly an upgrade.
 *
 * The shell deliberately does NOT start or manage the dsh server. That stays a
 * separate concern, so this window can be closed, reopened, or skipped entirely
 * without touching the harness.
 */

const { app, BrowserWindow, shell, dialog } = require('electron')
const path = require('node:path')

const TARGET = process.env.DSH_URL || 'http://127.0.0.1:3080'
const WAIT_MS = 40000

/** Is the harness answering yet? */
async function serverUp() {
  try {
    const res = await fetch(TARGET, { signal: AbortSignal.timeout(2000) })
    return res.ok || res.status < 500
  } catch {
    return false
  }
}

async function waitForServer() {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    if (await serverUp()) return true
    await new Promise((r) => setTimeout(r, 700))
  }
  return false
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#16181d',
    title: 'DeepSeek Harness',
    autoHideMenuBar: true,
    webPreferences: {
      // The whole point of this shell: <webview> gives the browser pane a real
      // embedded browsing context instead of a mirrored stream.
      webviewTag: true,
      // The page is our own local server, but it drives arbitrary third-party
      // sites inside webviews. Keep Node out of the renderer regardless --
      // nothing in the harness UI needs it, and the plugin detects this shell
      // from the user agent rather than from a Node global.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      spellcheck: true,
    },
  })

  win.loadURL(TARGET)

  // A link meant for a new window opens in the user's own browser rather than
  // spawning bare Electron windows with no chrome.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Same rule for anything a <webview> tries to pop open.
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) shell.openExternal(url)
        return { action: 'deny' }
      })
    }
  })

  win.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => {
    // Ignore sub-frame and webview failures; only the shell's own load matters.
    if (failedUrl !== TARGET) return
    dialog.showErrorBox(
      'Could not reach the harness',
      `${TARGET} did not load (${code} ${desc}).\n\n`
      + 'Start it first — the desktop shortcut, or:  dsh web',
    )
  })

  return win
}

app.whenReady().then(async () => {
  const up = await waitForServer()
  if (!up) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Open anyway', 'Quit'],
      defaultId: 1,
      title: 'DeepSeek Harness',
      message: `Nothing is answering at ${TARGET}.`,
      detail: 'Start the harness first (the desktop shortcut, or `dsh web`), then reopen this.',
    })
    if (choice === 1) { app.quit(); return }
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Closing the shell must not stop the harness; it is a separate process and
  // may well be in use from a normal browser tab.
  if (process.platform !== 'darwin') app.quit()
})
