// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionRow } from '../src/client/browser/parts/session-rows.js'
import { SessionMetaStore } from '../src/client/state/session-meta.js'
import { zh } from '../src/client/locales.js'


const t = (key: string, params?: Record<string, unknown>): string => {
  const raw = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

afterEach(cleanup)

describe('session hover actions', () => {
  it('shows pin archive more on hover actions', () => {
    const meta = new SessionMetaStore()
    const onArchive = vi.fn()
    const onMenu = vi.fn((event: React.MouseEvent) => { event.stopPropagation() })
    render(
      <SessionRow
        sessionId="s1"
        title="Demo"
        current={false}
        running={false}
        archived={false}
        renaming={false}
        renameDraft=""
        setRenameDraft={() => {}}
        commitRename={() => {}}
        onOpen={() => {}}
        onMenu={onMenu}
        onArchive={onArchive}
        draggable={false}
        meta={meta}
        t={t}
      />,
    )
    fireEvent.click(screen.getByLabelText('归档'))
    expect(onArchive).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByLabelText('更多操作'))
    expect(onMenu).toHaveBeenCalledTimes(1)
  })

  it('restores an archived session from its hover action', () => {
    const onRestore = vi.fn()
    render(
      <SessionRow
        sessionId="s1"
        title="Archived"
        current={false}
        running={false}
        archived
        renaming={false}
        renameDraft=""
        setRenameDraft={() => {}}
        commitRename={() => {}}
        onOpen={() => {}}
        onMenu={event => { event.stopPropagation() }}
        onArchive={() => {}}
        onRestore={onRestore}
        draggable={false}
        meta={new SessionMetaStore()}
        t={t}
      />,
    )
    fireEvent.click(screen.getByLabelText('恢复'))
    expect(onRestore).toHaveBeenCalledTimes(1)
  })

  it('opens a session row from the keyboard', () => {
    const meta = new SessionMetaStore()
    const onOpen = vi.fn()
    render(
      <SessionRow
        sessionId="s1"
        title="Demo"
        current={false}
        running={false}
        archived={false}
        renaming={false}
        renameDraft=""
        setRenameDraft={() => {}}
        commitRename={() => {}}
        onOpen={onOpen}
        onMenu={event => { event.stopPropagation() }}
        onArchive={() => {}}
        draggable={false}
        meta={meta}
        t={t}
      />,
    )
    const row = screen.getByRole('treeitem')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
