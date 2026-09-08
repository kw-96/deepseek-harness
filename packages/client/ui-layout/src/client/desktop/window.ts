/**
 * Thin wrapper over `window.__TAURI__.window` so the desktop title bar does
 * not take an npm dependency on `@tauri-apps/api`.
 */

/** Subset of the Tauri window face used by the title bar. */
export interface DesktopAppWindow {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  setFullscreen(fullscreen: boolean): Promise<void>
  isFullscreen(): Promise<boolean>
  isMaximized(): Promise<boolean>
  /** Subscribe to window resizes; resolves with an unlisten function. */
  onResized?(handler: () => void): Promise<() => void>
  startDragging(): Promise<void>
}

type TauriWindowApi = {
  getCurrentWindow(): DesktopAppWindow
}

/**
 * Resolve the current Tauri window, or undefined outside the desktop shell.
 * @returns the current window face when Tauri globals are present.
 */
export function getDesktopWindow(): DesktopAppWindow | undefined {
  const api = (window as Window & { __TAURI__?: { window?: TauriWindowApi } }).__TAURI__
  const win = api?.window
  if (win === undefined || typeof win.getCurrentWindow !== 'function') return undefined
  return win.getCurrentWindow()
}
