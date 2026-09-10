// @vitest-environment jsdom
/**
 * PanelToggle spec：Web 会话头渲染底部终端按钮；右侧面板由官方右栏自己的
 * 角落按钮负责，本插件不再渲染第二个开合按钮。桌面独立窗口整体渲染 null
 * （开合按钮由顶部栏在窗口控制按钮左侧提供）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PanelToggle } from '../src/client/PanelToggle.js'
import type { PanelToggleProps } from '../src/client/PanelToggle.js'

function props(over: Partial<PanelToggleProps> = {}): PanelToggleProps {
  return {
    setBottomOpen: vi.fn(),
    t: ((key: string) => key),
    ...over,
  }
}

afterEach(() => {
  cleanup()
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
})

describe('PanelToggle', () => {
  it('renders only the bottom terminal button in the Web shell', () => {
    const { container } = render(<PanelToggle {...props()} />)
    const labels = [...container.querySelectorAll('button')]
      .map(button => button.getAttribute('aria-label'))
    expect(labels).toEqual(['bottomTerminal'])
  })

  it('opens the bottom terminal from the bottom button', () => {
    const p = props()
    render(<PanelToggle {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'bottomTerminal' }))
    expect(p.setBottomOpen).toHaveBeenCalledWith(true)
  })

  it('renders nothing in the desktop shell (title bar owns the toggles)', () => {
    ;(window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {}
    const { container } = render(<PanelToggle {...props()} />)
    expect(container.querySelector('button')).toBeNull()
  })
})
