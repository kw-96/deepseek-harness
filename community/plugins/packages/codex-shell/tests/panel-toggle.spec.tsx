// @vitest-environment jsdom
/**
 * PanelToggle spec: Web 会话头渲染底部栏、右侧栏两个按钮（顺序固定），
 * 桌面独立窗口渲染 null（开合按钮由顶部栏在窗口控制按钮左侧提供）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PanelToggle } from '../src/client/PanelToggle.js'
import type { PanelToggleProps } from '../src/client/PanelToggle.js'
import { PanelController } from '../src/client/panel-controller.js'
import { SessionMetaStore } from '../src/client/session-meta.js'

function props(over: Partial<PanelToggleProps> = {}): PanelToggleProps {
  return {
    panel: new PanelController(),
    meta: new SessionMetaStore(),
    setColumnOpen: vi.fn(),
    setBottomOpen: vi.fn(),
    t: ((key: string) => key),
    ...over,
  } as PanelToggleProps
}

afterEach(() => {
  cleanup()
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
})

describe('PanelToggle', () => {
  it('renders bottom then right panel buttons in the Web shell', () => {
    const p = props()
    const { container } = render(<PanelToggle {...p} />)
    const labels = [...container.querySelectorAll('button')]
      .map(button => button.getAttribute('aria-label'))
    expect(labels).toEqual(['bottomTerminal', 'closeRightPanel'])
  })

  it('opens the bottom terminal from the bottom button', () => {
    const p = props()
    render(<PanelToggle {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'bottomTerminal' }))
    expect(p.setBottomOpen).toHaveBeenCalledWith(true)
  })

  it('toggles the right panel and syncs the details column', () => {
    const panel = new PanelController()
    const p = props({ panel })
    render(<PanelToggle {...p} />)
    expect(panel.getSnapshot().open).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'closeRightPanel' }))
    expect(panel.getSnapshot().open).toBe(false)
    expect(p.setColumnOpen).toHaveBeenCalledWith(false)
  })

  it('renders nothing in the desktop shell (title bar owns the toggles)', () => {
    ;(window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {}
    const { container } = render(<PanelToggle {...props()} />)
    expect(container.querySelector('button')).toBeNull()
  })
})
