// @vitest-environment jsdom
/**
 * 侧栏浏览器根组件的行为覆盖：项目分组渲染、会话打开、项目菜单与分组收起。
 * 这些装配（动作工厂 / 树体 / 浮层）此前没有直接测试，重构后在此兜底。
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodexBrowser } from '../src/client/browser/WorkspaceBrowser.js'
import type { CodexBrowserProps } from '../src/client/browser/browser-types.js'
import { SessionMetaStore } from '../src/client/state/session-meta.js'
import { BrowserPrefsStore } from '../src/client/state/prefs.js'
import { zh } from '../src/client/locales.js'
import type { SessionListStateLike, WorkspaceSnapshotLike } from '../src/client/faces.js'

const t = (key: string, params?: Record<string, unknown>): string => {
  const raw = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

const project = {
  projectId: 'p1', name: '项目一', roots: ['D:\\proj'],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
}

const sessionState: SessionListStateLike = {
  ids: ['s1'],
  byId: {
    s1: {
      id: 's1', displayTitle: '会话一', cwd: 'D:\\proj',
      running: false, blank: false, updatedAt: 10,
    },
  },
  current: undefined,
  phase: 'ready',
}

const workspaceState: WorkspaceSnapshotLike = {
  items: [{ workspaceId: 'w1', title: 'W1', path: 'D:\\proj', sessionIds: ['s1'] }],
  archivedSessionIds: [],
  phase: 'ready',
}

/** 用最小桩构建根组件属性；返回被调用的注入回调。 */
function renderBrowser(overrides: Partial<CodexBrowserProps> = {}) {
  const open = vi.fn()
  const props: CodexBrowserProps = {
    wide: true,
    expandSidebar: vi.fn(),
    useSessions: selector => selector(sessionState),
    useWorkspaces: selector => selector(workspaceState),
    startSession: vi.fn(),
    open,
    searchSessions: async () => ({ items: [], hasMore: false }),
    searchResultLimit: 10,
    renameSession: async () => {},
    forkSession: vi.fn(),
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    createWorkspace: async input => ({ workspaceId: 'w1', path: input.path }),
    insertWorkspaceBefore: async () => {},
    archiveSession: async () => {},
    unarchiveSession: async () => {},
    insertSessionBefore: async () => {},
    attachSession: async () => {},
    moveSession: async () => {},
    detachSession: async () => {},
    listProjects: async () => ({ projects: [project] }),
    createProject: async name => ({ project: { ...project, name } }),
    renameProject: async (projectId, name) => ({ project: { ...project, projectId, name } }),
    setProjectRoots: async () => ({ project }),
    deleteProject: async () => ({ deleted: true }),
    openWorkspacePath: async () => {},
    openTerminalForSession: async () => {},
    hasTerminal: () => true,
    exportSessionMarkdown: async () => null,
    canExportMarkdown: false,
    fsList: async () => ({ entries: [], truncated: false }),
    meta: new SessionMetaStore(),
    prefs: new BrowserPrefsStore(),
    t,
    ...overrides,
  }
  render(<CodexBrowser {...props} />)
  return { open, prefs: props.prefs }
}

beforeEach(() => { window.localStorage.clear() })

afterEach(cleanup)

describe('侧栏浏览器装配', () => {
  it('项目加载后按项目分组渲染会话行，点击会话打开', async () => {
    const { open } = renderBrowser()
    await screen.findByText('项目一')
    expect(screen.getByText('会话一')).toBeTruthy()
    fireEvent.click(screen.getByText('会话一'))
    expect(open).toHaveBeenCalledWith('s1')
  })

  it('项目行的更多按钮打开项目菜单', async () => {
    renderBrowser()
    await screen.findByText('项目一')
    // 项目行在前、会话行在后：取第一个「更多操作」即项目行的菜单入口。
    fireEvent.click(screen.getAllByLabelText('更多操作')[0]!)
    expect(screen.getByText('重命名项目')).toBeTruthy()
    expect(screen.getByText('删除项目')).toBeTruthy()
  })

  it('点击项目名收起分组，会话行随之隐藏且状态写入偏好仓', async () => {
    const { prefs } = renderBrowser()
    await screen.findByText('项目一')
    fireEvent.click(screen.getByText('项目一'))
    expect(screen.queryByText('会话一')).toBeNull()
    expect([...prefs.collapsedGroups()]).toContain('project:p1')
  })

  it('窄栏（轨道态）不渲染分区标题行，只保留搜索入口', async () => {
    renderBrowser({ wide: false })
    await screen.findByText('项目一')
    expect(screen.queryByText('整理侧边栏')).toBeNull()
    expect(screen.getByLabelText('搜索会话…')).toBeTruthy()
  })
})
