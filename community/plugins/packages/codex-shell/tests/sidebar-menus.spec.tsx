// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionMenuBody } from '../src/client/sidebar/session-menu.js'
import { WorkspaceMenuBody } from '../src/client/sidebar/workspace-menu.js'
import { SectionHeader } from '../src/client/sidebar/section-header.js'
import { sameDirectory, normalizePath } from '../src/client/sidebar/session-menu.js'
import { SessionRow } from '../src/client/session-rows.js'
import { SessionMetaStore } from '../src/client/session-meta.js'
import { zh } from '../src/client/locales.js'

const t = (key: string, params?: Record<string, unknown>): string => {
  const raw = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

afterEach(cleanup)

describe('path-util', () => {
  it('normalizes Windows paths for equality', () => {
    expect(normalizePath('D:\\a\\b\\')).toBe('d:/a/b')
    expect(sameDirectory('D:/a/b', 'd:\\a\\b\\')).toBe(true)
    expect(sameDirectory('D:/a/b', 'D:/a/c')).toBe(false)
  })
})

describe('session hover actions', () => {
  it('shows pin archive more on hover actions', () => {
    const meta = new SessionMetaStore()
    const onArchive = vi.fn()
    const onMenu = vi.fn((event: React.MouseEvent) => { event.stopPropagation() })
    render(
      <SessionRow
        sessionId="s1"
        title="Demo"
        timeLabel="刚刚"
        current={false}
        running={false}
        archived={false}
        subagents={[]}
        expanded={false}
        onToggleSubagents={() => {}}
        renaming={false}
        renameDraft=""
        setRenameDraft={() => {}}
        commitRename={() => {}}
        onOpen={() => {}}
        onMenu={onMenu}
        onArchive={onArchive}
        draggable={false}
        meta={meta}
        open={() => {}}
        t={t}
      />,
    )
    fireEvent.click(screen.getByLabelText('归档'))
    expect(onArchive).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByLabelText('更多操作'))
    expect(onMenu).toHaveBeenCalledTimes(1)
  })
})

describe('nested menus', () => {
  it('disables cross-directory move and worktree / cursor items', () => {
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
    expect(screen.getByTitle('目录不一致，无法迁移（需会话 cwd 与工作区 path 相同）')).toBeTruthy()
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
        t={t}
      />,
    )
    expect(screen.getByText('项目')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('整理侧边栏'))
    fireEvent.click(screen.getByText('在一个列表中'))
    expect(onOrganize).toHaveBeenCalledWith('flat')
  })
})
