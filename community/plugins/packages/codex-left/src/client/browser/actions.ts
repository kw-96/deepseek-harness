/**
 * 浏览器动作构造：会话/工作区菜单的动作与其依赖装配。
 * 组件在渲染时调用这些工厂，工厂闭包读取当时的快照与偏好；
 * 项目相关的动作与归并在 project-actions。
 */

import type {
  ProjectView, SessionId, SessionListStateLike, TFn, WorkspaceViewLike,
} from '../faces.js'
import type { SessionMetaStore } from '../state/session-meta.js'
import type { BrowserPrefsStore } from '../state/prefs.js'
import type { SessionMenuActions } from '../overlays/session-menu.js'
import type { WorkspaceMenuActions } from '../overlays/workspace-menu.js'
import type { CodexBrowserProps } from './browser-types.js'
import type { RenameController } from './use-browser-effects.js'
import { moveSessionToProject, sessionWorkspaceId } from './project-actions.js'

/** 会话深链接查询串。 */
function deepLink(sessionId: SessionId): string {
  return `?session=${sessionId}`
}

/** 复制文本；剪贴板不可用时跳过。 */
async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text) } catch { /* 剪贴板不可用时跳过 */ }
}

/** 动作工厂共享的依赖：当次渲染的快照、仓、注入回调与局部状态写入。 */
export interface BrowserActionDeps {
  list: SessionListStateLike
  workspaces: readonly WorkspaceViewLike[]
  projects: readonly ProjectView[]
  meta: SessionMetaStore
  prefs: BrowserPrefsStore
  t: TFn
  /** 关闭菜单。 */
  closeMenu: () => void
  /** 触发一次重渲染（置顶/未读等本地装饰改变后）。 */
  bump: () => void
  refreshProjects: () => Promise<void>
  beginSessionRename: (sessionId: SessionId, title: string) => void
  beginWorkspaceRename: (workspaceId: string, title: string) => void
  setWorktreeProjectId: (projectId: string | null) => void
  startSession: (workspaceId?: string) => void
  forkSession: (sessionId: SessionId) => void
  renameSession: (sessionId: SessionId, title: string) => Promise<void>
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
  renameProject: (projectId: string, name: string) => Promise<{ project: ProjectView }>
  deleteProject: (projectId: string) => Promise<{ deleted: boolean }>
  deleteWorkspace: (workspaceId: string) => Promise<void>
  archiveSession: (sessionId: SessionId) => Promise<void>
  moveSession: (workspaceId: string, sessionId: SessionId) => Promise<void>
  detachSession: (workspaceId: string, sessionId: SessionId) => Promise<void>
  createWorkspace: (input: { path: string }) => Promise<{ workspaceId: string, path: string }>
  setProjectRoots: (projectId: string, roots: readonly string[]) => Promise<{ project: ProjectView }>
  openWorkspacePath: (path: string) => Promise<void>
  openTerminalForSession: (sessionId: SessionId, cwd?: string) => Promise<void>
  hasTerminal: () => boolean
  exportSessionMarkdown: (sessionId: SessionId) => Promise<string | null>
  canExportMarkdown: boolean
}

/** 装配动作依赖：组件属性 + 当次渲染的快照 + 局部状态写入。 */
export interface ActionDepsInput {
  props: CodexBrowserProps
  list: SessionListStateLike
  workspaces: readonly WorkspaceViewLike[]
  projects: readonly ProjectView[]
  rename: RenameController
  closeMenu: () => void
  bump: () => void
  refreshProjects: () => Promise<void>
  setWorktreeProjectId: (projectId: string | null) => void
}

/**
 * 由组件属性与当次渲染状态装配动作依赖。
 * @param input - 属性、快照、重命名控制器与局部状态写入。
 * @returns 供三个动作工厂共享的依赖包。
 */
export function buildActionDeps(input: ActionDepsInput): BrowserActionDeps {
  const { props, rename } = input
  return {
    list: input.list,
    workspaces: input.workspaces,
    projects: input.projects,
    meta: props.meta,
    prefs: props.prefs,
    t: props.t,
    closeMenu: input.closeMenu,
    bump: input.bump,
    refreshProjects: input.refreshProjects,
    beginSessionRename: rename.beginSession,
    beginWorkspaceRename: rename.beginWorkspace,
    setWorktreeProjectId: input.setWorktreeProjectId,
    startSession: props.startSession,
    forkSession: props.forkSession,
    renameSession: props.renameSession,
    renameWorkspace: props.renameWorkspace,
    renameProject: props.renameProject,
    deleteProject: props.deleteProject,
    deleteWorkspace: props.deleteWorkspace,
    archiveSession: props.archiveSession,
    moveSession: props.moveSession,
    detachSession: props.detachSession,
    createWorkspace: props.createWorkspace,
    setProjectRoots: props.setProjectRoots,
    openWorkspacePath: props.openWorkspacePath,
    openTerminalForSession: props.openTerminalForSession,
    hasTerminal: props.hasTerminal,
    exportSessionMarkdown: props.exportSessionMarkdown,
    canExportMarkdown: props.canExportMarkdown,
  }
}

/**
 * 会话「更多」菜单的动作。
 * @param deps - 动作依赖。
 * @param sessionId - 目标会话。
 */
export function buildSessionActions(deps: BrowserActionDeps, sessionId: SessionId): SessionMenuActions {
  const { list, meta } = deps
  const row = meta.meta(sessionId)
  const close = deps.closeMenu
  return {
    pinned: row.pinned,
    unread: row.unread,
    cwd: list.byId[sessionId]?.cwd,
    markdownAvailable: deps.canExportMarkdown,
    terminalAvailable: deps.hasTerminal(),
    rename: () => { deps.beginSessionRename(sessionId, list.byId[sessionId]?.displayTitle ?? '') },
    togglePin: () => { meta.set(sessionId, { pinned: !row.pinned }); close(); deps.bump() },
    toggleUnread: () => { meta.set(sessionId, { unread: !row.unread }); close(); deps.bump() },
    archive: () => { close(); void deps.archiveSession(sessionId) },
    moveToProject: (projectId) => {
      close()
      void moveSessionToProject(deps, sessionId, projectId).catch(() => {
        // 归并失败（项目被删/目录不可用）时保持原归属
      })
    },
    moveToUngrouped: () => {
      const workspaceId = sessionWorkspaceId(deps.workspaces, sessionId)
      close()
      if (workspaceId === undefined) return
      void deps.detachSession(workspaceId, sessionId)
    },
    canMoveToUngrouped: sessionWorkspaceId(deps.workspaces, sessionId) !== undefined,
    copyCwd: () => { close(); void copyText(list.byId[sessionId]?.cwd ?? '') },
    copyLink: () => {
      close()
      void copyText(`${window.location.origin}${window.location.pathname}${deepLink(sessionId)}`)
    },
    copyMarkdown: () => {
      close()
      void deps.exportSessionMarkdown(sessionId).then(text => {
        if (text !== null) void copyText(text)
      })
    },
    fork: () => { close(); deps.forkSession(sessionId) },
    openInExplorer: () => {
      close()
      const path = list.byId[sessionId]?.cwd
      if (path !== undefined && path !== '') void deps.openWorkspacePath(path)
    },
    openInTerminal: () => {
      close()
      void deps.openTerminalForSession(sessionId, list.byId[sessionId]?.cwd)
    },
    openNewWindow: () => {
      close()
      window.open(`${window.location.pathname}${deepLink(sessionId)}`, '_blank')
    },
  }
}

/**
 * 工作区行「更多」菜单的动作。
 * @param deps - 动作依赖。
 * @param workspaceId - 目标工作区。
 */
export function buildWorkspaceActions(deps: BrowserActionDeps, workspaceId: string): WorkspaceMenuActions {
  const workspace = deps.workspaces.find(item => item.workspaceId === workspaceId)
  const pinned = deps.prefs.workspacePinned(workspaceId)
  const close = deps.closeMenu
  return {
    pinned,
    togglePin: () => { deps.prefs.setWorkspacePinned(workspaceId, !pinned); close(); deps.bump() },
    rename: () => { deps.beginWorkspaceRename(workspaceId, workspace?.title ?? '') },
    openInExplorer: () => {
      close()
      if (workspace?.path !== undefined) void deps.openWorkspacePath(workspace.path)
    },
    archiveAllSessions: () => {
      close()
      for (const id of workspace?.sessionIds ?? []) void deps.archiveSession(id)
    },
    deleteWorkspace: () => { close(); void deps.deleteWorkspace(workspaceId) },
    startSession: () => { close(); deps.startSession(workspaceId) },
  }
}
