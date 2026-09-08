// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionMenuBody } from '../src/client/sidebar/session-menu.js'
import { WorkspaceMenuBody } from '../src/client/sidebar/workspace-menu.js'
import { SectionHeader } from '../src/client/sidebar/section-header.js'
import { WorkspaceHead } from '../src/client/workspace-head.js'
import { SessionRow } from '../src/client/session-rows.js'
import { SessionMetaStore } from '../src/client/session-meta.js'
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

describe('nested menus', () => {
  it('moves sessions across directories and disables worktree / cursor items', () => {
    const actions = {
      rename: vi.fn(),
      togglePin: vi.fn(),
      toggleUnread: vi.fn(),
      archive: vi.fn(),
      moveToWorkspace: vi.fn(),
      moveToUngrouped: vi.fn(),
      canMoveToUngrouped: true,
      copyCwd: vi.fn(),
      copyLink: vi.fn(),
      copyMarkdown: vi.fn(),
      markdownAvailable: false,
      fork: vi.fn(),
      openInExplorer: vi.fn(),
      openInTerminal: vi.fn(),
      openNewWindow: vi.fn(),
      pinned: false,
      unread: false,
      cwd: 'D:/proj-a',
    }
    render(
      <SessionMenuBody
        actions={actions}
        workspaces={[
          { workspaceId: 'w1', title: 'A', path: 'D:/proj-a', sessionIds: [] },
          { workspaceId: 'w2', title: 'B', path: 'D:/proj-b', sessionIds: [] },
        ]}
        currentWorkspaceId="w1"
        t={t}
      />,
    )
    fireEvent.mouseEnter(screen.getByText('项目').closest('div')!)
    expect(screen.getByText('移到未分组')).toBeTruthy()
    fireEvent.click(screen.getByText('B'))
    expect(actions.moveToWorkspace).toHaveBeenCalledWith('w2')
    fireEvent.click(screen.getByText('移到未分组'))
    expect(actions.moveToUngrouped).toHaveBeenCalledTimes(1)
    fireEvent.mouseEnter(screen.getByText('分叉').closest('div')!)
    expect(screen.getByTitle('需要 Host 工作树能力（本期未接入）')).toBeTruthy()
    fireEvent.mouseEnter(screen.getByText('打开方式').closest('div')!)
    expect(screen.getByTitle('未安装打开器')).toBeTruthy()
    fireEvent.mouseEnter(screen.getByText('复制').closest('div')!)
    expect(screen.getByTitle('无法拉取会话历史')).toBeTruthy()
  })

  it('workspace menu includes disabled permanent worktree', () => {
    render(
      <WorkspaceMenuBody
        actions={{
          togglePin: vi.fn(),
          rename: vi.fn(),
          openInExplorer: vi.fn(),
          archiveAllSessions: vi.fn(),
          deleteWorkspace: vi.fn(),
          startSession: vi.fn(),
          pinned: false,
        }}
        t={t}
      />,
    )
    expect(screen.getByTitle('需要 Host 工作树能力（本期未接入）')).toBeTruthy()
  })
})

describe('section header', () => {
  it('switches organize and sort prefs', () => {
    const onOrganize = vi.fn()
    const onSort = vi.fn()
    render(
      <SectionHeader
        organize="byProject"
        sort="pinnedFirst"
        onOrganize={onOrganize}
        onSort={onSort}
        onAddWorkspace={vi.fn()}
        onAddProject={vi.fn()}
        t={t}
      />,
    )
    expect(screen.getByText('项目')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('整理侧边栏'))
    fireEvent.click(screen.getByText('在一个列表中'))
    expect(onOrganize).toHaveBeenCalledWith('flat')
  })

  it('toggles a workspace from the keyboard without opening its actions', () => {
    const onToggle = vi.fn()
    render(
      <WorkspaceHead
        label="项目 A"
        path="D:/project-a"
        sessionCount={1}
        pinned={false}
        collapsed={false}
        renaming={false}
        renameDraft=""
        setRenameDraft={() => {}}
        commitRename={() => {}}
        onToggle={onToggle}
        onMenu={() => {}}
        onBeginRename={() => {}}
        onTogglePin={() => {}}
        t={t}
      />,
    )
    fireEvent.keyDown(screen.getByRole('treeitem'), { key: ' ' })
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('opens project details explicitly and dismisses them with Escape', () => {
    render(
      <WorkspaceHead
        label="项目 A"
        path="D:/project-a"
        sessionCount={1}
        pinned={false}
        collapsed={false}
        renaming={false}
        renameDraft=""
        setRenameDraft={() => {}}
        commitRename={() => {}}
        onToggle={() => {}}
        onMenu={() => {}}
        onBeginRename={() => {}}
        onTogglePin={() => {}}
        t={t}
      />,
    )
    fireEvent.click(screen.getByLabelText('项目信息'))
    expect(screen.getByRole('dialog', { name: '项目信息' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '项目信息' })).toBeNull()
  })
})
