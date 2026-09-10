/** Bottom-panel tab state: UI spawns + Agent list merge. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TerminalApi } from './terminal-api.js'
import type { TFn } from '../faces.js'

export type ShellDialect = 'bash' | 'pwsh'
export type TabOrigin = 'ui' | 'agent'

export interface BottomTab {
  terminalId: string
  name?: string
  origin: TabOrigin
  title: string
}

const LIST_POLL_MS = 2500

/** Browser-side default dialect for the new-tab menu. */
export function defaultShellDialect(): ShellDialect {
  if (typeof navigator === 'undefined') return 'bash'
  return /Win/i.test(navigator.platform) || /Windows/i.test(navigator.userAgent) ? 'pwsh' : 'bash'
}

function tabTitle(
  entry: { terminalId: string; name?: string; origin: TabOrigin },
): string {
  const base = entry.name ?? entry.terminalId.slice(0, 8)
  return entry.origin === 'ui' ? base.replace(/^ui-/, '') : base
}

function toTab(
  entry: { terminalId: string; name?: string; origin: TabOrigin },
): BottomTab {
  return {
    terminalId: entry.terminalId,
    ...(entry.name !== undefined ? { name: entry.name } : {}),
    origin: entry.origin,
    title: tabTitle(entry),
  }
}

/**
 * Merge host list with local dismissals; keep UI tabs the user opened.
 * @param api - Codex Shell remotes.
 * @param sessionId - live Agent session, or undefined when none.
 * @param cwd - optional spawn cwd for new UI tabs.
 * @param t - locale lookup (reserved for future title copy).
 */
export function useBottomTerminals(
  api: TerminalApi,
  sessionId: string | undefined,
  cwd: string | undefined,
  _t: TFn,
): {
  tabs: BottomTab[]
  activeId: string | null
  error: string | null
  setActiveId: (id: string) => void
  createTab: (dialect: ShellDialect) => Promise<void>
  closeTab: (id: string) => Promise<void>
  clearError: () => void
} {
  const [tabs, setTabs] = useState<BottomTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hiddenAgentsRef = useRef<Set<string>>(new Set())
  const tabsRef = useRef(tabs)
  const bootRef = useRef(false)
  const cwdRef = useRef(cwd)
  tabsRef.current = tabs
  cwdRef.current = cwd

  const mergeList = useCallback(async (): Promise<BottomTab[]> => {
    if (sessionId === undefined) return []
    const listed = await api.terminalList(sessionId)
    const next: BottomTab[] = []
    for (const entry of listed.terminals) {
      if (entry.status.kind !== 'running') continue
      if (entry.origin === 'agent' && hiddenAgentsRef.current.has(entry.terminalId)) continue
      next.push(toTab(entry))
    }
    setTabs(next)
    return next
  }, [api, sessionId])

  useEffect(() => {
    setTabs([])
    setActiveId(null)
    hiddenAgentsRef.current = new Set()
    setError(null)
    bootRef.current = false
    if (sessionId === undefined) return
    let cancelled = false
    void (async () => {
      try {
        let next = await mergeList()
        if (cancelled) return
        if (next.length === 0 && !bootRef.current) {
          bootRef.current = true
          const spawnCwd = cwdRef.current
          const opened = await api.terminalOpen(sessionId, {
            ...(spawnCwd !== undefined ? { cwd: spawnCwd } : {}),
            shellDialect: defaultShellDialect(),
          })
          if (cancelled) return
          next = [toTab(opened)]
          setTabs(next)
        }
        setActiveId(current => current ?? next[0]?.terminalId ?? null)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      }
    })()
    const timer = window.setInterval(() => {
      void mergeList().catch(reason => {
        setError(reason instanceof Error ? reason.message : String(reason))
      })
    }, LIST_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [api, mergeList, sessionId])

  useEffect(() => {
    if (activeId !== null && tabs.some(tab => tab.terminalId === activeId)) return
    setActiveId(tabs[0]?.terminalId ?? null)
  }, [activeId, tabs])

  const createTab = async (dialect: ShellDialect): Promise<void> => {
    if (sessionId === undefined) return
    try {
      const spawnCwd = cwdRef.current
      const opened = await api.terminalOpen(sessionId, {
        ...(spawnCwd !== undefined ? { cwd: spawnCwd } : {}),
        shellDialect: dialect,
      })
      const tab = toTab(opened)
      setTabs(prev => [...prev.filter(item => item.terminalId !== tab.terminalId), tab])
      setActiveId(tab.terminalId)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const closeTab = async (id: string): Promise<void> => {
    const tab = tabsRef.current.find(item => item.terminalId === id)
    if (tab === undefined) return
    if (tab.origin === 'ui' && sessionId !== undefined) {
      await api.terminalClose(sessionId, id).catch(() => {})
    } else {
      hiddenAgentsRef.current.add(id)
    }
    setTabs(prev => prev.filter(item => item.terminalId !== id))
    if (activeId === id) setActiveId(null)
  }

  return {
    tabs,
    activeId,
    error,
    setActiveId,
    createTab,
    closeTab,
    clearError: () => { setError(null) },
  }
}
