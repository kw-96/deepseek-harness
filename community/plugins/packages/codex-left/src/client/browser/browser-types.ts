/** 侧栏浏览器对外契约：槽位注入面与组件属性。 */

import type { FsListResponse } from 'dsh-workspace-rail/types'
import type { SessionMetaStore } from '../state/session-meta.js'
import type { BrowserPrefsStore } from '../state/prefs.js'
import type {
  ProjectView, SearchResultLike, SelectorHook, SessionId, SessionListStateLike, TFn, WorkspaceSnapshotLike,
} from '../faces.js'

/** 注入共享面。 */
export interface CodexBrowserInjected {
  startSession: (workspaceId?: string) => void
  open: (sessionId: SessionId) => void
  searchSessions: (query: string, signal: AbortSignal) => Promise<{ items: readonly SearchResultLike[]; hasMore: boolean }>
  searchResultLimit: number
  renameSession: (sessionId: SessionId, title: string) => Promise<void>
  forkSession: (sessionId: SessionId) => void
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
  deleteWorkspace: (workspaceId: string) => Promise<void>
  /** 以目录路径创建或复用工作区（幂等），用于项目归并时补建工作树。 */
  createWorkspace: (input: { path: string }) => Promise<{ workspaceId: string, path: string }>
  insertWorkspaceBefore: (workspaceId: string, beforeWorkspaceId?: string) => Promise<void>
  archiveSession: (sessionId: SessionId) => Promise<void>
  /** 取消归档：把归档会话恢复到分组面。 */
  unarchiveSession: (sessionId: SessionId) => Promise<void>
  insertSessionBefore: (workspaceId: string, sessionId: SessionId, beforeSessionId?: SessionId) => Promise<void>
  attachSession: (workspaceId: string, sessionId: SessionId) => Promise<void>
  moveSession: (workspaceId: string, sessionId: SessionId) => Promise<void>
  detachSession: (workspaceId: string, sessionId: SessionId) => Promise<void>
  listProjects: () => Promise<{ projects: readonly ProjectView[] }>
  createProject: (name: string, roots?: readonly string[]) => Promise<{ project: ProjectView }>
  renameProject: (projectId: string, name: string) => Promise<{ project: ProjectView }>
  setProjectRoots: (projectId: string, roots: readonly string[]) => Promise<{ project: ProjectView }>
  deleteProject: (projectId: string) => Promise<{ deleted: boolean }>
  openWorkspacePath: (path: string) => Promise<void>
  openTerminalForSession: (sessionId: SessionId, cwd?: string) => Promise<void>
  /** 底栏终端插件是否已挂载：未安装时「在终端中打开」禁用。 */
  hasTerminal: () => boolean
  exportSessionMarkdown: (sessionId: SessionId) => Promise<string | null>
  canExportMarkdown: boolean
  /** 目录列举（新建项目/管理工作树的目录浏览）。 */
  fsList: (path: string) => Promise<FsListResponse>
  meta: SessionMetaStore
  prefs: BrowserPrefsStore
}

export interface CodexBrowserProps extends CodexBrowserInjected {
  wide: boolean
  expandSidebar: () => void
  useSessions: SelectorHook<SessionListStateLike>
  useWorkspaces: SelectorHook<WorkspaceSnapshotLike>
  t: TFn
}
