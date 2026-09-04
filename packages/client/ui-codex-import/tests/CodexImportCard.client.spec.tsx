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
  const props = {
    t: ((key: string, params?: { count?: number }) => {
      if (key === 'importedCount') return `Imported ${params?.count ?? 0}`
      if (key === 'title') return 'Codex import'
      if (key === 'run') return 'Import now'
      if (key === 'open') return 'Open'
      return key
    }),
    useCodexImportCard: (selector: (snapshot: CodexImportCardState) => CodexImportCardState) => selector(state),
    toggleSync,
    runImport,
    openSession,
  } as unknown as Parameters<typeof CodexImportCard>[0]
  const view = render(<CodexImportCard {...props} />)
  return { view, toggleSync, runImport, openSession }
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
      runs: [{ at: 100, imported: 1, skippedExisting: 0, skippedEmpty: 0, sessions: [{ id: sessionId, title: '整理校验表' }] }],
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
      runs: [{ at: 100, imported: 1, skippedExisting: 0, skippedEmpty: 0, sessions: [{ id: SessionId('codex-t2'), title: '' }] }],
    })
    expect(screen.getByText('codex-t2')).toBeDefined()
  })

  it('shows the no-sessions hint for a run that imported nothing', () => {
    renderCard({ autoSync: true, running: false, runs: [{ at: 100, imported: 0, skippedExisting: 2, skippedEmpty: 0, sessions: [] }] })
    expect(screen.getByText('noSessions')).toBeDefined()
  })
})
