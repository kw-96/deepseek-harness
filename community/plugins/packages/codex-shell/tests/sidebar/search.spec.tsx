// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionSearch } from '../../src/client/sidebar/search/use-session-search.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** 搜索 hook 的最小可视探针。 */
function SearchProbe(props: {
  searchSessions: (query: string, signal: AbortSignal) => Promise<{ items: readonly { sessionId: string; snippet: string }[]; hasMore: boolean }>
}): React.ReactNode {
  const { search, setQuery } = useSessionSearch(props.searchSessions)
  return <>
    <input aria-label="search" value={search.query} onChange={event => { setQuery(event.target.value) }} />
    <output>{search.loading ? 'loading' : search.items.map(item => item.sessionId).join(',')}</output>
  </>
}

describe('useSessionSearch', () => {
  it('cancels stale requests and only renders the latest result', async () => {
    vi.useFakeTimers()
    let firstSignal: AbortSignal | undefined
    const searchSessions = vi.fn((query: string, signal: AbortSignal) => {
      if (query === 'first') {
        firstSignal = signal
        return new Promise<{ items: readonly { sessionId: string; snippet: string }[]; hasMore: boolean }>(() => {})
      }
      return Promise.resolve({ items: [{ sessionId: 'second', snippet: '' }], hasMore: false })
    })
    render(<SearchProbe searchSessions={searchSessions} />)
    const input = screen.getByLabelText('search')
    fireEvent.change(input, { target: { value: 'first' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(180) })
    expect(searchSessions).toHaveBeenCalledWith('first', expect.any(AbortSignal))
    fireEvent.change(input, { target: { value: 'second' } })
    expect(firstSignal?.aborted).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(180) })
    expect(screen.getByText('second')).toBeTruthy()
  })
})
