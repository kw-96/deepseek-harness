/** 会话搜索的防抖、取消与最新请求保护。 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchResultLike } from '../../faces.js'

const SEARCH_DELAY_MS = 180

/** 侧栏搜索的渲染状态。 */
export interface SessionSearchState {
  query: string
  items: readonly SearchResultLike[]
  loading: boolean
}

/**
 * 管理会话全文搜索，避免每个按键都留下无法取消的远端请求。
 * @param searchSessions 会话搜索远端调用。
 * @returns 搜索状态、输入处理器和清空操作。
 */
export function useSessionSearch(
  searchSessions: (query: string, signal: AbortSignal) => Promise<{ items: readonly SearchResultLike[]; hasMore: boolean }>,
): {
  search: SessionSearchState
  setQuery: (value: string) => void
  clear: () => void
} {
  const [search, setSearch] = useState<SessionSearchState>({ query: '', items: [], loading: false })
  const timer = useRef<number | null>(null)
  const controller = useRef<AbortController | null>(null)
  const request = useRef(0)

  const cancel = useCallback((): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    controller.current?.abort()
    controller.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  const setQuery = useCallback((value: string): void => {
    cancel()
    const query = value.trim()
    if (query === '') {
      setSearch({ query: '', items: [], loading: false })
      return
    }
    const serial = request.current + 1
    request.current = serial
    setSearch({ query: value, items: [], loading: true })
    timer.current = window.setTimeout(() => {
      const next = new AbortController()
      controller.current = next
      void searchSessions(query, next.signal).then(
        result => {
          if (request.current !== serial || next.signal.aborted) return
          setSearch({ query: value, items: result.items, loading: false })
        },
        error => {
          if (request.current !== serial || next.signal.aborted) return
          setSearch({ query: value, items: [], loading: false })
          console.warn('侧栏会话搜索失败', error)
        },
      )
    }, SEARCH_DELAY_MS)
  }, [cancel, searchSessions])

  const clear = useCallback((): void => {
    cancel()
    request.current += 1
    setSearch({ query: '', items: [], loading: false })
  }, [cancel])

  return { search, setQuery, clear }
}
