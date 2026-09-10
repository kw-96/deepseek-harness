/** Menu model builders for the desktop title bar. */
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { dispatchDesktopCommand } from './commands.ts'
import type { DesktopAppWindow } from './window.ts'

import type { CommonKey } from '@deepseek-ai/dsh-client-locale/client'

/** Locale translator for common desktop title-bar keys. */
export type DesktopTitleBarT = (key: CommonKey) => string

/** One dropdown row or separator. */
export type MenuItem =
  | { kind: 'item'; id: string; label: string; shortcut?: string; disabled?: boolean; run: () => void }
  | { kind: 'sep' }

/** Top-level menu identifier. */
export type MenuId = 'file' | 'edit' | 'view'

const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.75
const ZOOM_MAX = 1.5

/** Read the current document zoom factor. */
export function readZoom(): number {
  const raw = document.documentElement.style.zoom
  if (raw === '') return 1
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) && value > 0 ? value : 1
}

/** Apply a document zoom factor (Chromium / WebView2). */
export function setZoom(factor: number): void {
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(factor * 100) / 100))
  document.documentElement.style.zoom = next === 1 ? '' : String(next)
}

/** Run a document editing command when the browser supports it. */
export function editCommand(command: string): void {
  // execCommand is the only browser path for the edit-menu commands
  // (undo/redo/cut/copy/paste/delete/select-all); deprecated but retained.
  // oxlint-disable-next-line typescript/no-deprecated
  try { document.execCommand(command) } catch { /* unsupported command */ }
}

/** True when the event target is a text field that owns clipboard / undo keys. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Match a menu shortcut label (e.g. `Ctrl+Shift+E`, `F11`) against a keydown.
 * @param event - browser keydown.
 * @param shortcut - label shown beside the menu item.
 * @returns whether the event matches the shortcut.
 */
export function eventMatchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+')
  const key = parts.at(-1)
  if (key === undefined) return false
  const needCtrl = parts.includes('Ctrl')
  const needShift = parts.includes('Shift')
  const needAlt = parts.includes('Alt')
  if (event.ctrlKey !== needCtrl || event.altKey !== needAlt || event.shiftKey !== needShift) return false
  if (key === '`') return event.key === '`' || event.code === 'Backquote'
  if (key === ',') return event.key === ','
  if (key === '[') return event.key === '['
  if (key === ']') return event.key === ']'
  if (key === '-') return event.key === '-'
  if (key === '=') return event.key === '=' || event.key === '+'
  if (key === '0') return event.key === '0'
  if (key.length === 1) return event.key.toUpperCase() === key.toUpperCase()
  return event.key === key
}

/**
 * Run the first enabled menu item whose shortcut matches this keydown.
 * Native edit shortcuts are skipped while a text field is focused.
 * @param event - browser keydown.
 * @param menus - current File / Edit / View definitions.
 * @returns true when a menu action ran (caller should preventDefault).
 */
export function tryRunMenuShortcut(
  event: KeyboardEvent,
  menus: readonly { items: readonly MenuItem[] }[],
): boolean {
  if (event.defaultPrevented || event.isComposing || isEditableTarget(event.target)) return false
  for (const group of menus) {
    for (const item of group.items) {
      if (item.kind !== 'item' || item.shortcut === undefined || item.disabled === true) continue
      if (!eventMatchesShortcut(event, item.shortcut)) continue
      item.run()
      return true
    }
  }
  return false
}

/**
 * 在下拉菜单内处理方向键、Home、End 与 Escape。
 * @param event 菜单中的键盘事件。
 * @param close 关闭菜单并将焦点交回菜单按钮。
 */
export function navigateDropdownKey(event: ReactKeyboardEvent<HTMLElement>, close: () => void): void {
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
  const index = items.indexOf(event.target as HTMLButtonElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    ;(event.currentTarget.previousElementSibling as HTMLButtonElement | null)?.focus()
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  const next = event.key === 'Home' ? 0
    : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[next]?.focus()
}

/** Inputs required to assemble the three menus. */
export type BuildMenusInput = {
  t: DesktopTitleBarT
  win: DesktopAppWindow | undefined
  backEnabled: boolean
  forwardEnabled: boolean
  sessionIdsLength: number
  toggleSidebar: () => void
  toggleRightbar: () => void
  toggleBottom: () => void
  openBottom: () => void
  walkHistory: (direction: 'back' | 'forward') => void
  neighborSession: (delta: -1 | 1) => void
}

/**
 * Build File / Edit / View menu definitions for the title bar.
 * @param input - actions and locale translator.
 * @returns ordered menu groups.
 */
export function buildMenus(input: BuildMenusInput): { id: MenuId; label: string; items: MenuItem[] }[] {
  const {
    t, win, backEnabled, forwardEnabled, sessionIdsLength,
    toggleSidebar, toggleRightbar, toggleBottom, openBottom, walkHistory, neighborSession,
  } = input
  return [
    {
      id: 'file', label: t('desktop.menu.file'), items: [
        { kind: 'item', id: 'new', label: t('desktop.menu.newSession'), shortcut: 'Ctrl+N', run: () => { dispatchDesktopCommand('new-session') } },
        { kind: 'item', id: 'open', label: t('desktop.menu.openWorkspace'), shortcut: 'Ctrl+O', run: () => { dispatchDesktopCommand('add-workspace') } },
        { kind: 'sep' },
        { kind: 'item', id: 'close', label: t('desktop.menu.closeWindow'), shortcut: 'Ctrl+W', run: () => { void win?.close() } },
        { kind: 'item', id: 'quit', label: t('desktop.menu.quit'), shortcut: 'Ctrl+Q', run: () => { void win?.close() } },
      ],
    },
    {
      id: 'edit', label: t('desktop.menu.edit'), items: [
        { kind: 'item', id: 'undo', label: t('desktop.menu.undo'), shortcut: 'Ctrl+Z', run: () => { editCommand('undo') } },
        { kind: 'item', id: 'redo', label: t('desktop.menu.redo'), shortcut: 'Ctrl+Y', run: () => { editCommand('redo') } },
        { kind: 'sep' },
        { kind: 'item', id: 'cut', label: t('desktop.menu.cut'), shortcut: 'Ctrl+X', run: () => { editCommand('cut') } },
        { kind: 'item', id: 'copy', label: t('copy'), shortcut: 'Ctrl+C', run: () => { editCommand('copy') } },
        { kind: 'item', id: 'paste', label: t('desktop.menu.paste'), shortcut: 'Ctrl+V', run: () => { editCommand('paste') } },
        { kind: 'item', id: 'delete', label: t('delete'), run: () => { editCommand('delete') } },
        { kind: 'sep' },
        { kind: 'item', id: 'selectAll', label: t('desktop.menu.selectAll'), shortcut: 'Ctrl+A', run: () => { editCommand('selectAll') } },
        { kind: 'sep' },
        { kind: 'item', id: 'settings', label: t('desktop.menu.settings'), shortcut: 'Ctrl+,', run: () => { dispatchDesktopCommand('open-settings') } },
      ],
    },
    {
      id: 'view', label: t('desktop.menu.view'), items: [
        { kind: 'item', id: 'sidebar', label: t('desktop.menu.toggleSidebar'), shortcut: 'Ctrl+B', run: toggleSidebar },
        { kind: 'item', id: 'bottom', label: t('desktop.menu.toggleBottom'), shortcut: 'Ctrl+J', run: toggleBottom },
        { kind: 'item', id: 'terminal', label: t('desktop.menu.openTerminal'), shortcut: 'Ctrl+`', run: openBottom },
        { kind: 'item', id: 'details', label: t('desktop.menu.toggleDetails'), shortcut: 'Ctrl+Shift+E', run: toggleRightbar },
        { kind: 'sep' },
        { kind: 'item', id: 'prev', label: t('desktop.menu.prevSession'), shortcut: 'Ctrl+Shift+[', disabled: sessionIdsLength < 2, run: () => { neighborSession(-1) } },
        { kind: 'item', id: 'next', label: t('desktop.menu.nextSession'), shortcut: 'Ctrl+Shift+]', disabled: sessionIdsLength < 2, run: () => { neighborSession(1) } },
        { kind: 'item', id: 'histBack', label: t('back'), shortcut: 'Ctrl+[', disabled: !backEnabled, run: () => { walkHistory('back') } },
        { kind: 'item', id: 'histFwd', label: t('desktop.nav.forward'), disabled: !forwardEnabled, run: () => { walkHistory('forward') } },
        { kind: 'sep' },
        { kind: 'item', id: 'zoomIn', label: t('desktop.menu.zoomIn'), shortcut: 'Ctrl+Shift+=', run: () => { setZoom(readZoom() + ZOOM_STEP) } },
        { kind: 'item', id: 'zoomOut', label: t('desktop.menu.zoomOut'), shortcut: 'Ctrl+-', run: () => { setZoom(readZoom() - ZOOM_STEP) } },
        { kind: 'item', id: 'zoomReset', label: t('desktop.menu.zoomReset'), shortcut: 'Ctrl+0', run: () => { setZoom(1) } },
        { kind: 'sep' },
        { kind: 'item', id: 'fullscreen', label: t('desktop.menu.fullscreen'), shortcut: 'F11', run: () => {
          void (async () => {
            if (win === undefined) return
            await win.setFullscreen(!(await win.isFullscreen()))
          })()
        } },
      ],
    },
  ]
}
