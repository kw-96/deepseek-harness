/** Shared open/close controller for the right-edge panel and pinned summary. */

import { useSyncExternalStore } from 'react'

export type PanelKind = 'files' | 'git' | 'projects' | 'plugins' | 'commands' | 'summary' | 'browser'

export interface PanelState {
  open: boolean
  tab: PanelKind
}

const STORAGE_KEY = 'dsh-codex-shell.panel.v1'

/**
 * Panel visibility plus the active tab, persisted per browser. Plain class
 * created in apply and handed to registrants through inject faces; components
 * mirror it into local state through {@link usePanelState}.
 */
export class PanelController {
  private readonly listeners = new Set<() => void>()
  private state: PanelState

  constructor() {
    let saved: PanelState = { open: false, tab: 'files' }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw !== null) saved = JSON.parse(raw) as PanelState
    } catch {
      // Missing or malformed preference falls back to the default.
    }
    this.state = saved
  }

  getSnapshot(): PanelState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  toggle(tab?: PanelKind): void {
    const next = this.state.open && (tab === undefined || tab === this.state.tab)
      ? { open: false, tab: this.state.tab }
      : { open: true, tab: tab ?? this.state.tab }
    this.commit(next)
  }

  open(tab?: PanelKind): void {
    if (!this.state.open || (tab !== undefined && tab !== this.state.tab)) {
      this.commit({ open: true, tab: tab ?? this.state.tab })
    }
  }

  close(): void {
    if (this.state.open) this.commit({ ...this.state, open: false })
  }

  private commit(next: PanelState): void {
    this.state = next
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* persistence is best-effort */ }
    for (const listener of this.listeners) listener()
  }

  dispose(): void {
    this.listeners.clear()
  }
}

/** Reactive panel state mirror for components. */
export function usePanelState(panel: PanelController): [PanelState, PanelController] {
  const state = useSyncExternalStore(
    callback => panel.subscribe(callback),
    () => panel.getSnapshot(),
    () => ({ open: false, tab: 'files' as PanelKind }),
  )
  return [state, panel]
}
