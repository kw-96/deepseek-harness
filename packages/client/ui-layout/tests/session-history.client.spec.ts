// @vitest-environment jsdom
/**
 * Session history stack for desktop title-bar back/forward.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  canGoBack, canGoForward, createSessionHistory, goBack, goForward, pushSessionVisit,
} from '../src/client/desktop/session-history.ts'
import { navigateDropdownKey, tryRunMenuShortcut } from '../src/client/desktop/menus.ts'

const a = 'a' as SessionId
const b = 'b' as SessionId
const c = 'c' as SessionId

describe('desktop session history', () => {
  it('pushes visits and walks back and forward', () => {
    const history = createSessionHistory()
    pushSessionVisit(history, a)
    pushSessionVisit(history, b)
    pushSessionVisit(history, c)
    expect(canGoBack(history)).toBe(true)
    expect(goBack(history)).toBe(b)
    expect(goBack(history)).toBe(a)
    expect(canGoBack(history)).toBe(false)
    expect(canGoForward(history)).toBe(true)
    expect(goForward(history)).toBe(b)
    expect(goForward(history)).toBe(c)
    expect(canGoForward(history)).toBe(false)
  })

  it('truncates forward entries after a new visit from the middle', () => {
    const history = createSessionHistory()
    pushSessionVisit(history, a)
    pushSessionVisit(history, b)
    pushSessionVisit(history, c)
    expect(goBack(history)).toBe(b)
    pushSessionVisit(history, a)
    expect(canGoForward(history)).toBe(false)
    expect(history.stack).toEqual([a, b, a])
  })

  it('does not take title-bar shortcuts from an active editor', () => {
    const input = document.createElement('input')
    const run = vi.fn()
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true })
    Object.defineProperty(event, 'target', { value: input })
    expect(tryRunMenuShortcut(event, [{ items: [{ kind: 'item', id: 'new', label: '新会话', shortcut: 'Ctrl+N', run }] }])).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('moves menu focus with arrow keys and returns it on Escape', () => {
    const trigger = document.createElement('button')
    const menu = document.createElement('div')
    const first = document.createElement('button')
    const second = document.createElement('button')
    menu.append(first, second)
    document.body.append(trigger, menu)
    first.focus()
    const down = { key: 'ArrowDown', currentTarget: menu, target: first, preventDefault: vi.fn() } as never
    navigateDropdownKey(down, vi.fn())
    expect(document.activeElement).toBe(second)
    const close = vi.fn()
    const escape = { key: 'Escape', currentTarget: menu, target: second, preventDefault: vi.fn() } as never
    navigateDropdownKey(escape, close)
    expect(close).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(trigger)
    menu.remove()
    trigger.remove()
  })
})
