/**
 * 注入面工厂：把 apply 闭包里的服务组装成各槽位组件需要的业务回调。
 *
 * 槽位框架按注册项缓存 inject 结果，所以这里返回的闭包必须自己读取可能
 * 后挂载的服务（例如底栏终端插件 dsh-codex-shell 的 remote），不能在
 * 工厂里一次性求值成布尔值。
 */

import type { FsListResponse, ProjectView } from 'dsh-workspace-rail/types'
import type { SessionMetaStore } from './state/session-meta.js'
import type { BrowserPrefsStore } from './state/prefs.js'
import type { AddWorkspaceInjected } from './overlays/workspace-picker.js'
import type { ProjectPickerInjected } from './overlays/hero-picker.js'
import type { CodexBrowserInjected } from './browser/WorkspaceBrowser.js'
import { exportSessionMarkdown } from './state/export-markdown.js'
import type {
  CodexLeftRemoteFace, LayoutFace, RemoteResult, SessionId, SessionsFace, TerminalOpenFace, WorkspacesFace,
} from './faces.js'

/** 会话面板的工作区打开动作（宿主 session remote 的可选方法）。 */
export interface OpenWorkspacePathFace {
  openWorkspacePath?: (request: { path: string }) => Promise<{ ok: boolean; error?: { message: string } }>
}

/** apply 交给注入面工厂的依赖包。 */
export interface CodexLeftDeps {
  sessions: SessionsFace
  workspaces: WorkspacesFace
  codexLeft: CodexLeftRemoteFace
  sessionRemote: OpenWorkspacePathFace | undefined
  connection: unknown
  layout: LayoutFace | undefined
  /** 底栏终端插件的 remote；未安装 dsh-codex-shell 时返回 undefined。 */
  terminal: () => TerminalOpenFace | undefined
  meta: SessionMetaStore
  prefs: BrowserPrefsStore
}

/**
 * 解开 Remote 结果，失败时抛出错误。
 * @param result - Remote 调用返回的结果联合。
 * @returns 成功时的值。
 */
export function unwrap<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(`${result.error.code}: ${result.error.message}`)
}

/** 在底栏终端里打开会话目录；未安装终端插件时抛出可读错误。 */
async function openTerminalForSession(deps: CodexLeftDeps, sessionId: SessionId, cwd?: string): Promise<void> {
  const shell = deps.terminal()
  if (shell === undefined) throw new Error('未安装底栏终端插件 dsh-codex-shell')
  if (deps.layout !== undefined) deps.layout.openBottom()
  await unwrap(await shell.terminalOpen(sessionId, cwd === undefined || cwd === '' ? {} : { cwd }))
}

/** 侧栏浏览器（sidebar.workspaces）的注入面。 */
export function createBrowserInject(deps: CodexLeftDeps): CodexBrowserInjected {
  const { sessions, workspaces, codexLeft, sessionRemote, connection, meta, prefs } = deps
  return {
    startSession: (workspaceId?: string) => {
      sessions.create(workspaceId === undefined ? {} : { workspaceId })
        .then(sessionId => { sessions.open(sessionId) })
        .catch(() => { /* 创建失败保持当前选择 */ })
    },
    open: sessionId => { sessions.open(sessionId) },
    searchSessions: async (query, signal) => {
      const result = await sessions.search(query, signal)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    searchResultLimit: sessions.searchResultLimit,
    renameSession: async (sessionId, title) => {
      const session = sessions.binding(sessionId)?.session
      if (session === undefined) throw new Error(`unknown session "${sessionId}"`)
      const result = await session.rename(title)
      if (!result.ok) throw new Error(result.error.message)
    },
    forkSession: (sessionId) => {
      sessions.fork({ sessionId, increaseTitle: true })
        .then(childId => { sessions.open(childId) })
        .catch(() => { /* 派生失败保持当前选择 */ })
    },
    renameWorkspace: async (workspaceId, title) => { await workspaces.rename(workspaceId, title) },
    deleteWorkspace: async (workspaceId) => { await workspaces.delete(workspaceId) },
    createWorkspace: async (input) => {
      const workspace = await workspaces.create(input)
      return { workspaceId: workspace.workspaceId, path: workspace.path }
    },
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
    archiveSession: async (sessionId) => { await workspaces.archiveSession(sessionId) },
    unarchiveSession: async (sessionId) => { await workspaces.unarchiveSession(sessionId) },
    insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
      await workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
    },
    attachSession: async (workspaceId, sessionId) => {
      await workspaces.attachSession(workspaceId, sessionId)
    },
    moveSession: async (workspaceId, sessionId) => {
      await workspaces.moveSession(workspaceId, sessionId)
    },
    detachSession: async (workspaceId, sessionId) => {
      await workspaces.detachSession(workspaceId, sessionId)
    },
    listProjects: async () => unwrap(await codexLeft.projectList()),
    createProject: async (name, roots) => unwrap(await codexLeft.projectCreate({ name, ...(roots === undefined ? {} : { roots }) })),
    renameProject: async (projectId, name) => unwrap(await codexLeft.projectRename({ projectId, name })),
    setProjectRoots: async (projectId, roots) => unwrap(await codexLeft.projectSetRoots({ projectId, roots })),
    deleteProject: async projectId => unwrap(await codexLeft.projectDelete({ projectId })),
    openWorkspacePath: async (path) => {
      const openPath = sessionRemote?.openWorkspacePath
      if (openPath === undefined) throw new Error('session.openWorkspacePath unavailable')
      const result = await openPath({ path })
      if (!result.ok) throw new Error(result.error?.message ?? 'openWorkspacePath failed')
    },
    openTerminalForSession: async (sessionId, cwd) => { await openTerminalForSession(deps, sessionId, cwd) },
    hasTerminal: () => deps.terminal() !== undefined,
    exportSessionMarkdown: (sessionId: SessionId) => exportSessionMarkdown(connection, sessionId),
    canExportMarkdown: (connection as { api?: { sessions?: { history?: unknown } } }).api?.sessions?.history !== undefined,
    fsList: async (path: string): Promise<FsListResponse> => unwrap(await codexLeft.fsList(path)),
    meta,
    prefs,
  }
}

/** 添加工作区弹窗（sidebar.footer.action）的注入面。 */
export function createAddWorkspaceInject(deps: CodexLeftDeps): AddWorkspaceInjected {
  return {
    fsList: async path => unwrap(await deps.codexLeft.fsList(path)),
    createWorkspace: input => deps.workspaces.create(input),
  }
}

/** 新建会话页项目选择器（conversation.hero.workspace）的注入面。 */
export function createHeroInject(deps: CodexLeftDeps): ProjectPickerInjected {
  const { workspaces, codexLeft, prefs } = deps
  return {
    listProjects: async (): Promise<{ projects: readonly ProjectView[] }> => unwrap(await codexLeft.projectList()),
    prefs,
    createWorkspace: async (input) => {
      const workspace = await workspaces.create(input)
      return { workspaceId: workspace.workspaceId, path: workspace.path }
    },
    createProject: async (name, roots) => unwrap(await codexLeft.projectCreate({
      name, ...(roots === undefined ? {} : { roots }),
    })),
    fsList: async path => unwrap(await codexLeft.fsList(path)),
  }
}
