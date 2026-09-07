/**
 * Session history stack for desktop title-bar back/forward.
 */
import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  canGoBack, canGoForward, createSessionHistory, goBack, goForward, pushSessionVisit,
} from '../src/client/desktop/session-history.ts'

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
})
