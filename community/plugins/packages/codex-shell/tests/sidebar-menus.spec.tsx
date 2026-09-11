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

describe('nested menus', () => {
  it('moves sessions across directories and disables worktree / cursor items', () => {
    const actions = {
      rename: vi.fn(),
      togglePin: vi.fn(),
      toggleUnread: vi.fn(),
      archive: vi.fn(),
      moveToProject: vi.fn(),
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
        projects={[
          { projectId: 'p1', name: 'A', roots: ['D:/proj-a'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
          { projectId: 'p2', name: 'B', roots: ['D:/proj-b'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        ]}
        currentProjectId="p1"
        t={t}
      />,
    )
    fireEvent.mouseEnter(screen.getByText('项目').closest('div')!)
    expect(screen.getByText('移到未分组')).toBeTruthy()
    fireEvent.click(screen.getByText('B'))
    expect(actions.moveToProject).toHaveBeenCalledWith('p2')
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
  it('switches organize, sort, and auto-archive prefs', () => {
    const onOrganize = vi.fn()
    const onSort = vi.fn()
    const onAutoArchive = vi.fn()
    render(
      <SectionHeader
        organize="byProject"
        sort="pinnedFirst"
        autoArchiveDays={30}
        onOrganize={onOrganize}
        onSort={onSort}
        onAutoArchive={onAutoArchive}
        onAddWorkspace={vi.fn()}
        onNewProject={vi.fn()}
        t={t}
      />,
    )
    expect(screen.getByText('项目')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('整理侧边栏'))
    // 自动归档：阈值选项带当前值勾选，点击派发天数（点击后菜单关闭）。
    expect(screen.getByText('30 天无活动')).toBeTruthy()
    fireEvent.click(screen.getByText('14 天无活动'))
    expect(onAutoArchive).toHaveBeenCalledWith(14)
    // 重新打开菜单再切换整理模式。
    fireEvent.click(screen.getByLabelText('整理侧边栏'))
    fireEvent.click(screen.getByText('在一个列表中'))
    expect(onOrganize).toHaveBeenCalledWith('flat')
  })

  it('offers turning auto-archive off', () => {
    const onAutoArchive = vi.fn()
    render(
      <SectionHeader
        organize="byProject"
        sort="pinnedFirst"
        autoArchiveDays={0}
        onOrganize={vi.fn()}
        onSort={vi.fn()}
        onAutoArchive={onAutoArchive}
        onAddWorkspace={vi.fn()}
        onNewProject={vi.fn()}
        t={t}
      />,
    )
    fireEvent.click(screen.getByLabelText('整理侧边栏'))
    fireEvent.click(screen.getByText('关闭'))
    expect(onAutoArchive).toHaveBeenCalledWith(0)
  })

  it('toggles a workspace from the keyboard without opening its actions', () => {
    const onToggle = vi.fn()
    render(
      <WorkspaceHead
        label="项目 A"
        path="D:/project-a"
        sessionCount={1}
        running={false}
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
        running={false}
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
