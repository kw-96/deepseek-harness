// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { CodexImportCard } from '../src/client/CodexImportCard.tsx'
import type { CodexImportCardState } from '../src/client/codex-import-card-controller.ts'

afterEach(cleanup)

/**
 * Complete one card state with the defaults every case shares: the preview
 * panel and the busy flag are additive fields, so a case that only cares about
 * history still renders exactly the history card.
 */
function withDefaults(state: Partial<CodexImportCardState>): CodexImportCardState {
  return { autoSync: false, running: false, busy: false, runs: [], preview: null, ...state }
}

function renderCard(state: Partial<CodexImportCardState>) {
  const toggleSync = vi.fn()
  const runImport = vi.fn()
  const openSession = vi.fn()
  const preview = vi.fn()
  const undo = vi.fn()
  const restore = vi.fn()
  const makeProps = (raw: Partial<CodexImportCardState>) => {
    const s = withDefaults(raw)
    return {
      t: ((key: string, params?: { count?: number }) => {
        if (key === 'importedCount') return `Imported ${params?.count ?? 0}`
        if (key === 'updatedCount') return `Updated ${params?.count ?? 0}`
        if (key === 'deferredActiveCount') return `Deferred ${params?.count ?? 0}`
        if (key === 'title') return 'Codex import'
        if (key === 'description') return 'Import local Codex threads'
        if (key === 'run') return 'Import now'
        if (key === 'open') return 'Open'
        return key
      }),
      useCodexImportCard: (selector: (snapshot: CodexImportCardState) => CodexImportCardState) => selector(s),
      toggleSync,
      runImport,
      preview,
      undo,
      restore,
      openSession,
    } as unknown as Parameters<typeof CodexImportCard>[0]
  }
  const view = render(<CodexImportCard {...makeProps(state)} />)
  const openCard = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'expand: Codex import' }))
  }
  return {
    view,
    openCard,
    rerender: (next: Partial<CodexImportCardState>) => { view.rerender(<CodexImportCard {...makeProps(next)} />) },
    toggleSync,
    runImport,
    preview,
    undo,
    restore,
    openSession,
  }
}

describe('CodexImportCard', () => {
  it('collapses by default and discloses controls on expand, matching sibling cards', () => {
    const { openCard } = renderCard({ autoSync: true, running: false, runs: [] })
    expect(screen.getByText('Codex import')).toBeDefined()
    expect(screen.getByText('Import local Codex threads')).toBeDefined()
    // Controls stay hidden until the header is expanded.
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Import now' })).toBeNull()
    openCard()
    expect(screen.getByRole('checkbox')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Import now' })).toBeDefined()
  })

  it('renders the sync toggle and import button', () => {
    const { openCard, toggleSync, runImport } = renderCard({ autoSync: true, running: false, runs: [] })
    openCard()
    const toggle = screen.getByRole('checkbox') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    fireEvent.click(toggle)
    expect(toggleSync).toHaveBeenCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'Import now' }))
    expect(runImport).toHaveBeenCalled()
  })

  it('shows the running label while an import is in flight', () => {
    const { openCard } = renderCard({ autoSync: true, running: true, runs: [] })
    openCard()
    expect(screen.getByRole('button', { name: 'running' })).toBeDefined()
  })

  it('renders the empty history hint when no runs exist', () => {
    const { openCard } = renderCard({ autoSync: true, running: false, runs: [] })
    openCard()
    expect(screen.getByText('empty')).toBeDefined()
  })

  it('renders run history with session titles and open buttons', () => {
    const sessionId = SessionId('codex-t1')
    const { openCard, openSession } = renderCard({
      autoSync: true,
      running: false,
      runs: [{ at: 100, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, undoneAt: 0, sessions: [{ id: sessionId, title: '整理校验表' }] }],
    })
    openCard()
    expect(screen.getByText('Imported 1')).toBeDefined()
    expect(screen.getByText('整理校验表')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(openSession).toHaveBeenCalledWith(sessionId)
  })

  it('falls back to the session id when a run session has no title', () => {
    const { openCard } = renderCard({
      autoSync: true,
      running: false,
      runs: [{ at: 100, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, undoneAt: 0, sessions: [{ id: SessionId('codex-t2'), title: '' }] }],
    })
    openCard()
    expect(screen.getByText('codex-t2')).toBeDefined()
  })

  it('shows updated and active-deferred counts separately from new imports', () => {
    const { openCard } = renderCard({
      autoSync: true,
      running: false,
      runs: [{ at: 100, imported: 0, updated: 2, skippedExisting: 0, skippedEmpty: 0, deferredActive: 1, undoneAt: 0, sessions: [] }],
    })
    openCard()
    expect(screen.getByText('Updated 2')).toBeDefined()
    expect(screen.getByText('Deferred 1')).toBeDefined()
  })

  it('shows the no-sessions hint for a run that imported nothing', () => {
    const { openCard } = renderCard({
      autoSync: true,
      running: false,
      runs: [{ at: 100, imported: 0, updated: 0, skippedExisting: 2, skippedEmpty: 0, deferredActive: 0, undoneAt: 0, sessions: [] }],
    })
    openCard()
    expect(screen.getByText('noSessions')).toBeDefined()
  })

  it('starts the newest run open and discloses older runs on demand', () => {
    const { openCard } = renderCard({
      autoSync: true,
      running: false,
      runs: [
        { at: 200, imported: 2, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, undoneAt: 0, sessions: [{ id: SessionId('codex-new'), title: '最新会话' }] },
        { at: 100, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, undoneAt: 0, sessions: [{ id: SessionId('codex-old'), title: '较早会话' }] },
      ],
    })
    openCard()
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
    const { openCard, rerender } = renderCard({
      autoSync: true,
      running: false,
      runs: [{ at: 100, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, undoneAt: 0, sessions: [{ id: SessionId('codex-first'), title: '第一轮会话' }] }],
    })
    openCard()
    expect(screen.getByText('第一轮会话')).toBeDefined()
    rerender({
      autoSync: true,
      running: false,
      runs: [
        { at: 300, imported: 3, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, undoneAt: 0, sessions: [{ id: SessionId('codex-latest'), title: '新导入会话' }] },
        { at: 100, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, undoneAt: 0, sessions: [{ id: SessionId('codex-first'), title: '第一轮会话' }] },
      ],
    })
    expect(screen.getByText('新导入会话')).toBeDefined()
  })

  it('renders preview verdicts and starts a preview on demand', () => {
    const { openCard, preview } = renderCard({
      preview: {
        summary: { imported: 2, updated: 1, skippedExisting: 3, skippedEmpty: 0, deferredActive: 0 },
        entries: [{
          threadId: 't1', sessionId: SessionId('codex-thread-1'), title: '待导入会话', cwd: 'E:/x', kind: 'imported', events: 5,
        }],
      },
    })
    openCard()
    expect(screen.getByText('previewImported')).toBeDefined()
    expect(screen.getByText('待导入会话')).toBeDefined()
    expect(screen.getByText('kindImported')).toBeDefined()
    fireEvent.click(screen.getByText('preview'))
    expect(preview).toHaveBeenCalled()
  })

  it('marks an undone run and routes undo and restore for it', () => {
    const { openCard, undo, restore } = renderCard({
      runs: [{
        at: 500,
        imported: 1,
        updated: 0,
        skippedExisting: 0,
        skippedEmpty: 0,
        deferredActive: 0,
        undoneAt: 1700000000000,
        sessions: [{ id: SessionId('codex-thread-9'), title: '已撤销会话' }],
      }],
    })
    openCard()
    expect(screen.getByText('undone')).toBeDefined()
    fireEvent.click(screen.getByText('undo'))
    expect(undo).toHaveBeenCalledWith(500)
    fireEvent.click(screen.getByText('restore'))
    expect(restore).toHaveBeenCalledWith(500)
  })
})
