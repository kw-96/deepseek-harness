// @vitest-environment jsdom
/**
 * DesktopTitleBar interaction spec: dropdown open/close behavior across the
 * header, the drag region guard, and maximize/restore state sync against the
 * stubbed Tauri window face injected through window.__TAURI__.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { DesktopTitleBar } from '../src/client/desktop/DesktopTitleBar.tsx'
import type { DesktopTitleBarProps } from '../src/client/desktop/DesktopTitleBar.tsx'
import type { DesktopAppWindow } from '../src/client/desktop/window.ts'

/** 侧栏收起态注入桩：真实装配层提供 observable，测试里固定为展开。 */
const useCollapsed = <S,>(sel: (collapsed: boolean) => S): S => sel(false)

/** Controllable Tauri window stub with a manual resize broadcast. */
function makeDesktopWindow() {
  const resizeHandlers = new Set<() => void>()
  let maximized = false
  const minimize = vi.fn(async () => {})
  const toggleMaximize = vi.fn(async () => {
    maximized = !maximized
    for (const handler of [...resizeHandlers]) handler()
  })
  const close = vi.fn(async () => {})
  const setFullscreen = vi.fn(async () => {})
  const isFullscreen = vi.fn(async () => false)
  const isMaximized = vi.fn(async () => maximized)
  const onResized = vi.fn(async (handler: () => void) => {
    resizeHandlers.add(handler)
    return () => { resizeHandlers.delete(handler) }
  })
  const startDragging = vi.fn(async () => {})
  const face: DesktopAppWindow = {
    minimize, toggleMaximize, close, setFullscreen, isFullscreen, isMaximized, onResized, startDragging,
  }
  return {
    face,
    isMaximized,
    toggleMaximize,
    startDragging,
    close,
    setMaximized(next: boolean): void {
      maximized = next
      for (const handler of [...resizeHandlers]) handler()
    },
  }
}

/** Expose a window face through the Tauri global before the component mounts. */
function installDesktopWindow(face: DesktopAppWindow): { invoke: ReturnType<typeof vi.fn> } {
  const invoke = vi.fn(async () => undefined)
  ;(window as unknown as { __TAURI__: unknown }).__TAURI__ = {
    window: { getCurrentWindow: () => face },
    core: { invoke },
  }
  return { invoke }
}

/** Render the title bar with recording props and a static session feed. */
function mountBar(win: DesktopAppWindow) {
  const tauri = installDesktopWindow(win)
  const t = ((key: string) => key) as DesktopTitleBarProps['t']
  const useSessions = (<S,>(sel: (s: SessionListState) => S): S =>
    sel({ ids: [], byId: {} } as unknown as SessionListState))
  return { ...render(
    <DesktopTitleBar
      t={t}
      toggleSidebar={vi.fn()}
      toggleRightbar={vi.fn()}
      toggleBottom={vi.fn()}
      openBottom={vi.fn()}
      openSession={vi.fn()}
      useSessions={useSessions}
      useSidebarCollapsed={useCollapsed}
    />,
  ), ...tauri }
}

afterEach(() => {
  cleanup()
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__
})

describe('DesktopTitleBar dropdowns', () => {
  it('opens a menu on click and closes it when the blank drag area is pressed', () => {
    const win = makeDesktopWindow()
    const { container } = mountBar(win.face)
    fireEvent.click(screen.getByRole('button', { name: 'desktop.menu.file' }))
    expect(screen.getByRole('menu')).toBeTruthy()
    const drag = container.querySelector('header')!.children[1] as HTMLElement
    fireEvent.pointerDown(drag)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes the open menu on a pointer press outside the header', async () => {
    const win = makeDesktopWindow()
    mountBar(win.face)
    fireEvent.click(screen.getByRole('button', { name: 'desktop.menu.edit' }))
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.pointerDown(document.body)
    await waitFor(() => { expect(screen.queryByRole('menu')).toBeNull() })
  })

  it('keeps the menu open when a dropdown item is pressed', () => {
    const win = makeDesktopWindow()
    mountBar(win.face)
    fireEvent.click(screen.getByRole('button', { name: 'desktop.menu.file' }))
    const item = screen.getByRole('menuitem', { name: /desktop\.menu\.newSession/ })
    fireEvent.pointerDown(item)
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('toggles the menu closed when its own button is clicked again', () => {
    const win = makeDesktopWindow()
    mountBar(win.face)
    const file = screen.getByRole('button', { name: 'desktop.menu.file' })
    fireEvent.click(file)
    fireEvent.click(file)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('switches to the second menu when another menu button is clicked', () => {
    const win = makeDesktopWindow()
    mountBar(win.face)
    fireEvent.click(screen.getByRole('button', { name: 'desktop.menu.file' }))
    fireEvent.click(screen.getByRole('button', { name: 'desktop.menu.edit' }))
    expect(screen.getByRole('menuitem', { name: /desktop\.menu\.undo/ })).toBeTruthy()
  })

  it('skips window dragging while a menu is open', async () => {
    const win = makeDesktopWindow()
    const { container } = mountBar(win.face)
    const drag = container.querySelector('header')!.children[1] as HTMLElement
    fireEvent.mouseDown(drag, { button: 0 })
    expect(win.startDragging).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'desktop.menu.view' }))
    fireEvent.mouseDown(drag, { button: 0 })
    await waitFor(() => { expect(screen.queryByRole('menu')).toBeNull() })
    expect(win.startDragging).toHaveBeenCalledTimes(1)
  })
})

describe('DesktopTitleBar maximize state', () => {
  it('tracks the window maximize state and swaps to restore, then back on click', async () => {
    const win = makeDesktopWindow()
    mountBar(win.face)
    expect(screen.getByRole('button', { name: 'desktop.window.maximize' })).toBeTruthy()
    await waitFor(() => { expect(win.isMaximized).toHaveBeenCalled() })
    win.setMaximized(true)
    const restore = await screen.findByRole('button', { name: 'desktop.window.restore' })
    fireEvent.click(restore)
    expect(win.toggleMaximize).toHaveBeenCalledTimes(1)
    await waitFor(() => { expect(screen.getByRole('button', { name: 'desktop.window.maximize' })).toBeTruthy() })
  })

  it('keeps the plain maximize button when the window never reports maximized', async () => {
    const win = makeDesktopWindow()
    mountBar(win.face)
    await waitFor(() => { expect(win.isMaximized).toHaveBeenCalled() })
    expect(screen.queryByRole('button', { name: 'desktop.window.restore' })).toBeNull()
  })
})

describe('DesktopTitleBar panel toggles', () => {
  it('places the right panel button before the window controls and wires it', () => {
    const win = makeDesktopWindow()
    installDesktopWindow(win.face)
    const t = ((key: string) => key) as DesktopTitleBarProps['t']
    const useSessions = (<S,>(sel: (s: SessionListState) => S): S =>
      sel({ ids: [], byId: {} } as unknown as SessionListState))
    const toggleRightbar = vi.fn()
    const { container } = render(
      <DesktopTitleBar
        t={t}
        toggleSidebar={vi.fn()}
        toggleRightbar={toggleRightbar}
        toggleBottom={vi.fn()}
        openBottom={vi.fn()}
        openSession={vi.fn()}
        useSessions={useSessions}
        useSidebarCollapsed={useCollapsed}
      />,
    )
    const labels = [...container.querySelectorAll('header button')]
      .map(button => button.getAttribute('aria-label'))
    expect(labels.slice(-4)).toEqual([
      'desktop.menu.toggleDetails',
      'desktop.window.minimize',
      'desktop.window.maximize',
      'close',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'desktop.menu.toggleDetails' }))
    expect(toggleRightbar).toHaveBeenCalledTimes(1)
  })
})

describe('DesktopTitleBar window commands', () => {
  it('hides to the tray through the window face and quits through the shell command', () => {
    const win = makeDesktopWindow()
    const { invoke } = mountBar(win.face)
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    // 「关闭」只走窗口关闭请求（壳把它改成隐藏到托盘）。
    expect(win.close).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'desktop.menu.file' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /desktop\.menu\.quit/ }))
    expect(invoke).toHaveBeenCalledWith('quit_desktop_app')
    expect(win.close).toHaveBeenCalledTimes(1)
  })
})
