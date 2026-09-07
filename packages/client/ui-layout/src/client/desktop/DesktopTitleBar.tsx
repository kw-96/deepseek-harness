/**
 * Codex-style desktop title bar: sidebar toggle, back/forward, File/Edit/View
 * menus, drag region, and Windows window controls. Mounted only in Tauri.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { CloseIcon, ChevronLeft, ChevronRight, MaxIcon, MinIcon, PanelIcon } from './icons.tsx'
import { buildMenus, tryRunMenuShortcut, type DesktopTitleBarT, type MenuId } from './menus.ts'
import {
  canGoBack, canGoForward, createSessionHistory, goBack, goForward, pushSessionVisit,
} from './session-history.ts'
import { getDesktopWindow } from './window.ts'
import css from './DesktopTitleBar.module.css'

export type { DesktopTitleBarT }

/** Props for the desktop title bar. */
export type DesktopTitleBarProps = {
  t: DesktopTitleBarT
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  toggleDetails: () => void
  toggleBottom: () => void
  openBottom: () => void
  openSession: (id: SessionId) => void
  useSessions: <S>(sel: (s: SessionListState) => S) => S
}

/**
 * Render the Codex-style desktop title bar.
 * @param props - layout actions, session hooks, and locale translator.
 * @returns the title bar element tree.
 */
export function DesktopTitleBar(props: DesktopTitleBarProps) {
  const { t, sidebarCollapsed, toggleSidebar, toggleDetails, toggleBottom, openBottom, openSession, useSessions } = props
  const [menu, setMenu] = useState<MenuId | null>(null)
  const historyRef = useRef(createSessionHistory())
  const navigating = useRef(false)
  const rootRef = useRef<HTMLElement | null>(null)
  const current = useSessions(s => s.current)
  const sessionIds = useSessions(s => s.ids)
  const [, setTick] = useState(0)
  const refreshHistory = useCallback(() => { setTick(n => n + 1) }, [])

  useEffect(() => {
    if (navigating.current) { navigating.current = false; return }
    pushSessionVisit(historyRef.current, current)
    refreshHistory()
  }, [current, refreshHistory])

  useEffect(() => {
    if (menu === null) return
    const onPointer = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node) === true) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setMenu(null) }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const walkHistory = (direction: 'back' | 'forward'): void => {
    const id = direction === 'back' ? goBack(historyRef.current) : goForward(historyRef.current)
    refreshHistory()
    if (id === undefined) return
    navigating.current = true
    openSession(id)
  }

  const neighborSession = (delta: -1 | 1): void => {
    if (current === undefined || sessionIds.length === 0) return
    const index = sessionIds.indexOf(current)
    if (index < 0) return
    const next = sessionIds[index + delta]
    if (next !== undefined) openSession(next)
  }

  const win = getDesktopWindow()
  const history = historyRef.current
  const backEnabled = canGoBack(history)
  const forwardEnabled = canGoForward(history)
  const menus = buildMenus({
    t, win, backEnabled, forwardEnabled, sessionIdsLength: sessionIds.length,
    toggleSidebar, toggleDetails, toggleBottom, openBottom, walkHistory, neighborSession,
  })
  const menusRef = useRef(menus)
  menusRef.current = menus

  // Bind menu shortcuts globally; labels alone do not register key handlers.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!tryRunMenuShortcut(event, menusRef.current)) return
      event.preventDefault()
      setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [])

  return (
    <header ref={rootRef} className={css.root}>
      <div className={css.left}>
        <button type="button" className={css.iconBtn} aria-label={sidebarCollapsed ? t('expand') : t('collapse')} onClick={toggleSidebar}>
          <PanelIcon />
        </button>
        <button type="button" className={css.iconBtn} aria-label={t('back')} disabled={!backEnabled} onClick={() => { walkHistory('back') }}>
          <ChevronLeft />
        </button>
        <button type="button" className={css.iconBtn} aria-label={t('desktop.nav.forward')} disabled={!forwardEnabled} onClick={() => { walkHistory('forward') }}>
          <ChevronRight />
        </button>
        {menus.map(entry => (
          <div key={entry.id} className={css.menuWrap}>
            <button
              type="button"
              className={menu === entry.id ? `${css.menuBtn} ${css.menuBtnActive}` : css.menuBtn}
              aria-expanded={menu === entry.id}
              aria-haspopup="menu"
              onClick={() => { setMenu(cur => cur === entry.id ? null : entry.id) }}
            >
              {entry.label}
            </button>
            {menu === entry.id && (
              <div className={css.dropdown} role="menu">
                {entry.items.map((item, index) => item.kind === 'sep'
                  ? <div key={`sep-${index}`} className={css.sep} role="separator" />
                  : (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className={css.dropdownItem}
                      disabled={item.disabled === true}
                      onClick={() => { setMenu(null); item.run() }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut !== undefined && <span className={css.shortcut}>{item.shortcut}</span>}
                    </button>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className={css.drag} data-tauri-drag-region />
      <div className={css.controls}>
        <button type="button" className={css.winBtn} aria-label={t('desktop.window.minimize')} onClick={() => { void win?.minimize() }}>
          <MinIcon />
        </button>
        <button type="button" className={css.winBtn} aria-label={t('desktop.window.maximize')} onClick={() => { void win?.toggleMaximize() }}>
          <MaxIcon />
        </button>
        <button type="button" className={`${css.winBtn} ${css.closeBtn}`} aria-label={t('close')} onClick={() => { void win?.close() }}>
          <CloseIcon />
        </button>
      </div>
    </header>
  )
}
