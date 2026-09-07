/**
 * Detect whether the page runs inside the experimental Tauri desktop shell.
 * Browser tabs never expose the Tauri globals injected by withGlobalTauri.
 */

/** True when the WebView carries Tauri IPC globals. */
export function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false
  const candidate = window as Window & {
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
  }
  return candidate.__TAURI_INTERNALS__ !== undefined || candidate.__TAURI__ !== undefined
}
