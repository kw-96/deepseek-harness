/**
 * Local structural faces for the 0.1.2 harness client seams this plugin rides.
 * The published client type lines moved faster than community plugins, so the
 * plugin compiles against minimal structural contracts (the same pattern the
 * shipped community sidebars use) instead of the volatile SlotMap merges.
 * Runtime names are still validated fail-loud by the harness slot core.
 */

import type { ReactNode } from 'react'
import type { FsListResponse, ProjectView } from 'dsh-workspace-rail/types'

export type SessionId = string
export type WorkspaceId = string

export type { ProjectView } from 'dsh-workspace-rail/types'

/** Minimal durable session row the sidebar renders. */
export interface SessionSummaryLike {
  id: SessionId
  title?: string
  displayTitle: string
  cwd?: string
  parentId?: SessionId
  origin?: 'subagent'
  running: boolean
  completed?: boolean
  blank: boolean
  updatedAt: number
}

export interface SessionListStateLike {
  ids: readonly SessionId[]
  byId: Readonly<Record<SessionId, SessionSummaryLike>>
  current: SessionId | undefined
  phase: string
}

export interface WorkspaceViewLike {
  workspaceId: WorkspaceId
  title: string
  path: string
  sessionIds: readonly SessionId[]
}

export interface WorkspaceSnapshotLike {
  items: readonly WorkspaceViewLike[]
  archivedSessionIds: readonly SessionId[]
  phase: string
}

/** Snapshot-selector hook shape the framework injects (useSessions/useWorkspaces). */
export type SelectorHook<S> = <T>(selector: (state: S) => T) => T

export interface SearchResultLike {
  sessionId: SessionId
  snippet: string
}

export type RemoteOk<T> = { ok: true; value: T }
export type RemoteErr = { ok: false; error: { code: string; message: string } }
export type RemoteResult<T> = RemoteOk<T> | RemoteErr

/** codexLeft remote namespace face (mounted by this plugin's own contribution). */
export interface CodexLeftRemoteFace {
  fsList(path: string): Promise<RemoteResult<FsListResponse>>
  projectList(): Promise<RemoteResult<{ projects: readonly ProjectView[] }>>
  projectCreate(request: { name: string; roots?: readonly string[] }): Promise<RemoteResult<{ project: ProjectView }>>
  projectRename(request: { projectId: string; name: string }): Promise<RemoteResult<{ project: ProjectView }>>
  projectSetRoots(request: { projectId: string; roots: readonly string[] }): Promise<RemoteResult<{ project: ProjectView }>>
  projectDelete(request: { projectId: string }): Promise<RemoteResult<{ deleted: boolean }>>
}

/**
 * 侧边栏工作台插件（dsh-better-sidebar）的 openTab 面。
 *
 * 它只在客户端半边注册服务，所以这里按结构面调用、运行时缺席即报错：装了
 * 该插件的部署里，会话菜单的「在终端中打开」用的是用户当前在用的那个终端。
 */
export interface BetterSidebarFace {
  /**
   * 打开一个 tab；`terminal` 类型即该插件的工作台终端。
   * @param seed - tab 种子（类型、可选标题与停靠位）
   * @param scope - 目标会话与工作目录；缺省为当前会话
   */
  openTab(
    seed: { type: string; title?: string; target?: 'right' | 'bottom' },
    scope?: { sessionId: SessionId; cwd?: string },
  ): void
}

/** Typert client remote face the gateway provides. */
export interface RemoteFace {
  $mount(contribution: unknown): Promise<() => Promise<void>>
  codexLeft: CodexLeftRemoteFace
}

/** Locale face: namespace registration and typed bind. */
export interface LocaleFace {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
}

export type SlotSpecLike = { kind: 'single' | 'list'; scope: 'root' | 'session' | 'session-maybe' }

/** Registration options this plugin passes to slots.register. */
export interface RegisterOptionsLike {
  name: string
  id?: string
  order?: number
  priority?: number
  locale?: string
  label?: () => string
  children?: Record<string, SlotSpecLike>
  inject?: () => object
}

/** The slots service face, structurally. */
export interface SlotsFace {
  inject(key: string, callback: () => (() => void) | void): () => void
  register(options: RegisterOptionsLike, component: unknown): () => void
  entries(key: string): readonly unknown[]
  subscribe(key: string, listener: () => void): () => void
}

/** Sessions service face the browser drives. */
export interface SessionsFace {
  create(options?: { workspaceId?: WorkspaceId; cwd?: string; sessionId?: SessionId }): Promise<SessionId>
  open(sessionId: SessionId): void
  search(query: string, signal: AbortSignal): Promise<RemoteResult<{ items: readonly SearchResultLike[]; hasMore: boolean }>>
  searchResultLimit: number
  binding(sessionId: SessionId): { session: { rename(title: string): Promise<RemoteResult<unknown>> } } | undefined
  fork(options: { sessionId: SessionId; atSeq?: number; increaseTitle?: boolean }): Promise<SessionId>
}

/** Workspaces service face the browser drives. */
export interface WorkspacesFace {
  rename(workspaceId: WorkspaceId, title: string): Promise<unknown>
  delete(workspaceId: WorkspaceId): Promise<void>
  insertBefore(workspaceId: WorkspaceId, beforeWorkspaceId?: WorkspaceId): Promise<void>
  archiveSession(sessionId: SessionId): Promise<void>
  /** 取消归档：把会话恢复到分组面（工作区归属从未改变，位置原样回来）。 */
  unarchiveSession(sessionId: SessionId): Promise<void>
  insertSessionBefore(workspaceId: WorkspaceId, sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>
  attachSession(workspaceId: WorkspaceId, sessionId: SessionId): Promise<unknown>
  moveSession(workspaceId: WorkspaceId, sessionId: SessionId): Promise<unknown>
  detachSession(workspaceId: WorkspaceId, sessionId: SessionId): Promise<unknown>
  create(input: { path: string }): Promise<WorkspaceViewLike>
}

/** Render-slot prop shape the framework injects on the sidebar browser. */
export type RenderSlotFn = (
  name: string,
  owner: unknown,
  options?: { fallback?: ReactNode },
) => ReactNode

export type TFn = (key: string, params?: Record<string, unknown>) => string

/** Minimal observable source shape (renderer-bound hooks and occupancy sources). */
export interface HostObservableLike<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}
