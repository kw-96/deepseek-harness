/**
 * Session visit stack for the desktop title-bar back/forward controls.
 * Push on ordinary selection changes; walk the stack for explicit navigation.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Mutable history cursor over visited session ids. */
export type SessionHistory = {
  stack: SessionId[]
  index: number
}

/** Create an empty session history. */
export function createSessionHistory(): SessionHistory {
  return { stack: [], index: -1 }
}

/**
 * Record a session selection that is not itself a history walk.
 * @param history - mutable history.
 * @param id - newly selected session, or undefined when clearing.
 */
export function pushSessionVisit(history: SessionHistory, id: SessionId | undefined): void {
  if (id === undefined) return
  if (history.index >= 0 && history.stack[history.index] === id) return
  history.stack = history.stack.slice(0, history.index + 1)
  history.stack.push(id)
  history.index = history.stack.length - 1
}

/** Whether back navigation has a prior entry. */
export function canGoBack(history: SessionHistory): boolean {
  return history.index > 0
}

/** Whether forward navigation has a later entry. */
export function canGoForward(history: SessionHistory): boolean {
  return history.index >= 0 && history.index < history.stack.length - 1
}

/**
 * Move one step backward in the visit stack.
 * @param history - mutable history.
 * @returns the session to open, when available.
 */
export function goBack(history: SessionHistory): SessionId | undefined {
  if (!canGoBack(history)) return undefined
  history.index -= 1
  return history.stack[history.index]
}

/**
 * Move one step forward in the visit stack.
 * @param history - mutable history.
 * @returns the session to open, when available.
 */
export function goForward(history: SessionHistory): SessionId | undefined {
  if (!canGoForward(history)) return undefined
  history.index += 1
  return history.stack[history.index]
}
