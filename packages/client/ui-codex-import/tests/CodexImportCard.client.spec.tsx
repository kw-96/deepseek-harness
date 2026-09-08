// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { CodexImportCard } from '../src/client/CodexImportCard.tsx'
import type { CodexImportCardState } from '../src/client/codex-import-card-controller.ts'

afterEach(cleanup)

function renderCard(state: CodexImportCardState) {
  const toggleSync = vi.fn()
  const runImport = vi.fn()
  const openSession = vi.fn()
  const makeProps = (s: CodexImportCardState) => ({
    t: ((key: string, params?: { count?: number }) => {
      if (key === 'importedCount') return `Imported ${params?.count ?? 0}`
      if (key === 'updatedCount') return `Updated ${params?.count ?? 0}`
      if (key === 'deferredActiveCount') return `Deferred ${params?.count ?? 0}`
      if (key === 'title') return 'Codex import'
      if (key === 'run') return 'Import now'
      if (key === 'open') return 'Open'
      return key
    }),
    useCodexImportCard: (selector: (snapshot: CodexImportCardState) => CodexImportCardState) => selector(s),
    toggleSync,
    runImport,
    openSession,
  } as unknown as Parameters<typeof CodexImportCard>[0])
  const view = render(<CodexImportCard {...makeProps(state)} />)
  return {
    view,
    rerender: (next: CodexImportCardState) => { view.rerender(<CodexImportCard {...makeProps(next)} />) },
    toggleSync,
    runImport,
    openSession,
  }
}

describe('CodexImportCard', () => {
  it('renders the sync toggle and import button', () => {
    const { toggleSync, runImport } = renderCard({ autoSync: true, running: false, runs: [] })
    expect(screen.getByText('Codex import')).toBeDefined()
    const toggle = screen.getByRole('checkbox') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    fireEvent.click(toggle)
    expect(toggleSync).toHaveBeenCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'Import now' }))
    expect(runImport).toHaveBeenCalled()
  })

  it('shows the running label while an import is in flight', () => {
    renderCard({ autoSync: true, running: true, runs: [] })
    expect(screen.getByRole('button', { name: 'running' })).toBeDefined()
  })

  it('renders the empty history hint when no runs exist', () => {
    renderCard({ autoSync: true, running: false, runs: [] })
    expect(screen.getByText('empty')).toBeDefined()
  })

  it('renders run history with session titles and open buttons', () => {
    const sessionId = SessionId('codex-t1')
    const { openSession } = renderCard({
      autoSync: true,
      running: false,
      runs: [{ at: 100, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, sessions: [{ id: sessionId, title: '整理校验表' }] }],
    })
    expect(screen.getByText('Imported 1')).toBeDefined()
    expect(screen.getByText('整理校验表')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(openSession).toHaveBeenCalledWith(sessionId)
  })

  it('falls back to the session id when a run session has no title', () => {
    renderCard({
      autoSync: true,
      running: false,
      runs: [{ at: 100, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, sessions: [{ id: SessionId('codex-t2'), title: '' }] }],
    })
    expect(screen.getByText('codex-t2')).toBeDefined()
  })

  it('shows updated and active-deferred counts separately from new imports', () => {
    renderCard({
      autoSync: true,
      running: false,
      runs: [{ at: 100, imported: 0, updated: 2, skippedExisting: 0, skippedEmpty: 0, deferredActive: 1, sessions: [] }],
    })
    expect(screen.getByText('Updated 2')).toBeDefined()
    expect(screen.getByText('Deferred 1')).toBeDefined()
  })

  it('shows the no-sessions hint for a run that imported nothing', () => {
    renderCard({
      autoSync: true,
      running: false,
      runs: [{ at: 100, imported: 0, updated: 0, skippedExisting: 2, skippedEmpty: 0, deferredActive: 0, sessions: [] }],
    })
    expect(screen.getByText('noSessions')).toBeDefined()
  })

  it('starts the newest run open and discloses older runs on demand', () => {
    renderCard({
      autoSync: true,
      running: false,
      runs: [
        { at: 200, imported: 2, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, sessions: [{ id: SessionId('codex-new'), title: '最新会话' }] },
        { at: 100, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, sessions: [{ id: SessionId('codex-old'), title: '较早会话' }] },
      ],
    })
    expect(screen.getByText('最新会话')).toBeDefined()
    expect(screen.queryByText('较早会话')).toBeNull()
    const olderHead = screen.getByRole('button', { name: /Imported 1/ })
    expect(olderHead.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(olderHead)
    expect(olderHead.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('较早会话')).toBeDefined()
    fireEvent.click(olderHead)
    expect(olderHead.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('较早会话')).toBeNull()
  })

  it('opens a newly prepended run when a manual import returns', () => {
    const { rerender } = renderCard({
      autoSync: true,
      running: false,
      runs: [{ at: 100, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, sessions: [{ id: SessionId('codex-first'), title: '第一轮会话' }] }],
    })
    expect(screen.getByText('第一轮会话')).toBeDefined()
    rerender({
      autoSync: true,
      running: false,
      runs: [
        { at: 300, imported: 3, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, sessions: [{ id: SessionId('codex-latest'), title: '新导入会话' }] },
        { at: 100, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, sessions: [{ id: SessionId('codex-first'), title: '第一轮会话' }] },
      ],
    })
    expect(screen.getByText('新导入会话')).toBeDefined()
  })
})
