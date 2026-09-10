/**
 * Codex-style desktop title bar: sidebar toggle, back/forward, File/Edit/View
 * menus, drag region, and Windows window controls. Mounted only in Tauri.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { CloseIcon, ChevronLeft, ChevronRight, MaxIcon, MinIcon, PanelBottomIcon, PanelIcon, PanelRightIcon, RestoreIcon } from './icons.tsx'
import { buildMenus, navigateDropdownKey, tryRunMenuShortcut, type DesktopTitleBarT, type MenuId } from './menus.ts'
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
  /** 右侧面板开合（官方右栏；组合里无右栏包时由装配层回落到 details 列）。 */
  toggleRightbar: () => void
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
  const { t, sidebarCollapsed, toggleSidebar, toggleRightbar, toggleBottom, openBottom, openSession, useSessions } = props
  const [menu, setMenu] = useState<MenuId | null>(null)
  const [maximized, setMaximized] = useState(false)
  const historyRef = useRef(createSessionHistory())
  const navigating = useRef(false)
  const rootRef = useRef<HTMLElement | null>(null)
  const current = useSessions(s => s.current)
  const sessionIds = useSessions(s => s.ids)
  const [, setTick] = useState(0)
  const refreshHistory = useCallback(() => { setTick(n => n + 1) }, [])
  // getCurrentWindow() returns a fresh proxy per call; memoize a stable face.
  const win = useMemo(() => getDesktopWindow(), [])

  useEffect(() => {
    if (navigating.current) { navigating.current = false; return }
    pushSessionVisit(historyRef.current, current)
    refreshHistory()
  }, [current, refreshHistory])

  // Track the desktop window's maximized state so the button reflects it.
  useEffect(() => {
    if (win === undefined) return
    let disposed = false
    let unlisten: (() => void) | undefined
    const sync = (): void => {
      // 读取失败时保留上一状态；resize 事件与切换后的主动刷新会再次同步。
      void win.isMaximized().then((value) => { if (!disposed) setMaximized(value) }).catch(() => {})
    }
    sync()
    void win.onResized?.(sync).then((fn) => {
      if (disposed) { fn(); return }
      unlisten = fn
    }).catch(() => { /* 订阅被拒绝时仍靠切换后的主动刷新同步 */ })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [win])

  // 切换最大化后主动回读状态，不单依赖 resize 事件。
  const toggleMaximize = (): void => {
    void (async () => {
      if (win === undefined) return
      await win.toggleMaximize()
      setMaximized(await win.isMaximized())
    })()
  }

  useEffect(() => {
    if (menu === null) return
    const onPointer = (event: PointerEvent): void => {
      const target = event.target
      const root = rootRef.current
      if (root === null) return
      // 点击已打开的下拉面板内部：保持展开，条目自身的 onClick 负责关闭。
      const openDropdown = root.querySelector('[data-desktop-menu]')
      if (target instanceof Node && openDropdown !== null && openDropdown.contains(target)) return
      // 点击任一菜单按钮：交给按钮自身的开合逻辑。
      if (target instanceof Element && target.closest('button[aria-haspopup="menu"]') !== null) return
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

  const history = historyRef.current
  const backEnabled = canGoBack(history)
  const forwardEnabled = canGoForward(history)
  const menus = buildMenus({
    t, win, backEnabled, forwardEnabled, sessionIdsLength: sessionIds.length,
    toggleSidebar, toggleRightbar, toggleBottom, openBottom, walkHistory, neighborSession,
  })
  const menusRef = useRef(menus)
  menusRef.current = menus

  const focusMenuItem = (id: MenuId, edge: 'first' | 'last'): void => {
    window.requestAnimationFrame(() => {
      const items = rootRef.current?.querySelectorAll<HTMLButtonElement>(`[data-desktop-menu="${id}"] button:not(:disabled)`)
      if (items === undefined || items.length === 0) return
      items[edge === 'first' ? 0 : items.length - 1]?.focus()
    })
  }

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
          <div
            key={entry.id}
            className={css.menuWrap}
            onMouseEnter={() => { if (menu !== null) setMenu(entry.id) }}
          >
            <button
              type="button"
              className={menu === entry.id ? `${css.menuBtn} ${css.menuBtnActive}` : css.menuBtn}
              aria-expanded={menu === entry.id}
              aria-haspopup="menu"
              aria-controls={`desktop-menu-${entry.id}`}
              onClick={() => { setMenu(cur => cur === entry.id ? null : entry.id) }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
                event.preventDefault()
                setMenu(entry.id)
                focusMenuItem(entry.id, event.key === 'ArrowDown' ? 'first' : 'last')
              }}
            >
              {entry.label}
            </button>
            {menu === entry.id && (
              <div
                id={`desktop-menu-${entry.id}`}
                data-desktop-menu={entry.id}
                className={css.dropdown}
                role="menu"
                aria-label={entry.label}
                onKeyDown={(event) => { navigateDropdownKey(event, () => { setMenu(null) }) }}
              >
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
      <div
        className={css.drag}
        onMouseDown={(event) => {
          if (event.button !== 0) return
          // 菜单展开时先收起菜单，不启动窗口拖拽。
          if (menu !== null) { setMenu(null); return }
          void win?.startDragging()
        }}
        onDoubleClick={toggleMaximize}
      />
      <div className={css.controls}>
        <button
          type="button"
          className={css.iconBtn}
          aria-label={t('desktop.menu.toggleBottom')}
          title={t('desktop.menu.toggleBottom')}
          onClick={toggleBottom}
        >
          <PanelBottomIcon />
        </button>
        <button
          type="button"
          className={css.iconBtn}
          aria-label={t('desktop.menu.toggleDetails')}
          title={t('desktop.menu.toggleDetails')}
          onClick={toggleRightbar}
        >
          <PanelRightIcon />
        </button>
        <button type="button" className={css.winBtn} aria-label={t('desktop.window.minimize')} onClick={() => { void win?.minimize() }}>
          <MinIcon />
        </button>
        <button
          type="button"
          className={css.winBtn}
          aria-label={t(maximized ? 'desktop.window.restore' : 'desktop.window.maximize')}
          onClick={toggleMaximize}
        >
          {maximized ? <RestoreIcon /> : <MaxIcon />}
        </button>
        <button type="button" className={`${css.winBtn} ${css.closeBtn}`} aria-label={t('close')} onClick={() => { void win?.close() }}>
          <CloseIcon />
        </button>
      </div>
    </header>
  )
}
