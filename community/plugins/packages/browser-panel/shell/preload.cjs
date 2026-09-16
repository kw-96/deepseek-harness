/**
 * Bridge for the connection strip.
 *
 * The strip is the shell's own UI, but it still runs with contextIsolation on
 * and no Node access -- it gets exactly these four calls and nothing else.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshShell', {
  /** Current connections and which one is active. */
  getState: () => ipcRenderer.invoke('shell:state'),

  /** Switch to a connection by id. */
  connect: (id) => ipcRenderer.invoke('shell:connect', id),

  /**
   * Tell the main process the dropdown opened or closed.
   *
   * The strip is a fixed-height view and its bounds CLIP its content, so a
   * dropdown taller than the strip would simply be cut off. Main grows the view
   * over the harness while the list is open and shrinks it again after.
   */
  setExpanded: (expanded, height) => ipcRenderer.invoke('shell:expand', !!expanded, Number(height) || 0),

  /** Push state changes (connecting, connected, failed) into the strip. */
  onState: (cb) => {
    ipcRenderer.on('shell:state', (_e, state) => { try { cb(state) } catch { /* ignore */ } })
  },
})
