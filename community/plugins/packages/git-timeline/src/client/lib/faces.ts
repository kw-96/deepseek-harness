/**
 * 宿主服务的本地结构面：社区插件按结构类型对接宿主 seam，不依赖其编排
 * 类型线；运行时的槽位核心与右栏注册表仍会对每个名字做加载期校验。
 */

import type { ComponentType } from 'react'
import type {
  GitActionResponse, GitBranches, GitCommitDetail, GitCommitResponse, GitDiffResponse, GitIdentity, GitLogResponse,
  GitMessageResponse, GitMessageText, GitStatusResponse,
} from '../../types.js'

export type TFn = (key: string, params?: Record<string, unknown>) => string

/** 文案服务。 */
export interface LocaleFace {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  bind(namespace: string): TFn
}

/** 槽位服务（仅取本插件用到的两个动作）。 */
export interface SlotsFace {
  inject(name: string, setup: () => (() => void) | undefined): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** Remote 服务：挂载贡献并暴露命名空间。 */
export interface RemoteFace {
  $mount(contribution: unknown): Promise<() => Promise<void>>
}

export type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

/** 本插件自己的 Remote 命名空间面。 */
export interface GitPanelRemoteFace {
  status(cwd: string): Promise<RemoteResult<GitStatusResponse>>
  log(cwd: string, limit?: number): Promise<RemoteResult<GitLogResponse>>
  diff(cwd: string, path: string, staged: boolean): Promise<RemoteResult<GitDiffResponse>>
  show(cwd: string, hash: string): Promise<RemoteResult<GitCommitDetail>>
  showFile(cwd: string, hash: string, path: string): Promise<RemoteResult<GitDiffResponse>>
  branches(cwd: string): Promise<RemoteResult<GitBranches>>
  checkout(cwd: string, branch: string): Promise<RemoteResult<GitActionResponse>>
  createBranch(cwd: string, name: string): Promise<RemoteResult<GitActionResponse>>
  lastMessage(cwd: string): Promise<RemoteResult<GitMessageText>>
  discard(cwd: string, paths: readonly string[]): Promise<RemoteResult<GitActionResponse>>
  stage(cwd: string, paths: readonly string[]): Promise<RemoteResult<GitActionResponse>>
  unstage(cwd: string, paths: readonly string[]): Promise<RemoteResult<GitActionResponse>>
  stageAll(cwd: string): Promise<RemoteResult<GitActionResponse>>
  unstageAll(cwd: string): Promise<RemoteResult<GitActionResponse>>
  commit(cwd: string, message: string, amend: boolean): Promise<RemoteResult<GitCommitResponse>>
  push(cwd: string): Promise<RemoteResult<GitActionResponse>>
  pull(cwd: string): Promise<RemoteResult<GitActionResponse>>
  fetch(cwd: string): Promise<RemoteResult<GitActionResponse>>
  identity(cwd: string): Promise<RemoteResult<GitIdentity>>
  setIdentity(cwd: string, name: string, email: string, scope: 'global' | 'local'): Promise<RemoteResult<GitActionResponse>>
  message(sessionId: string, cwd: string): Promise<RemoteResult<GitMessageResponse>>
}

/** 解包后的面板 API：组件直接消费的形态（RemoteResult 已在装配层解开）。 */
export interface GitPanelApi {
  status(cwd: string): Promise<GitStatusResponse>
  log(cwd: string, limit?: number): Promise<GitLogResponse>
  diff(cwd: string, path: string, staged: boolean): Promise<GitDiffResponse>
  show(cwd: string, hash: string): Promise<GitCommitDetail>
  showFile(cwd: string, hash: string, path: string): Promise<GitDiffResponse>
  branches(cwd: string): Promise<GitBranches>
  checkout(cwd: string, branch: string): Promise<GitActionResponse>
  createBranch(cwd: string, name: string): Promise<GitActionResponse>
  lastMessage(cwd: string): Promise<GitMessageText>
  discard(cwd: string, paths: readonly string[]): Promise<GitActionResponse>
  stage(cwd: string, paths: readonly string[]): Promise<GitActionResponse>
  unstage(cwd: string, paths: readonly string[]): Promise<GitActionResponse>
  stageAll(cwd: string): Promise<GitActionResponse>
  unstageAll(cwd: string): Promise<GitActionResponse>
  commit(cwd: string, message: string, amend: boolean): Promise<GitCommitResponse>
  push(cwd: string): Promise<GitActionResponse>
  pull(cwd: string): Promise<GitActionResponse>
  fetch(cwd: string): Promise<GitActionResponse>
  identity(cwd: string): Promise<GitIdentity>
  setIdentity(cwd: string, name: string, email: string, scope: 'global' | 'local'): Promise<GitActionResponse>
  message(sessionId: string, cwd: string): Promise<GitMessageResponse>
}

/**
 * 会话工作区文件变更流（官方 `remote.workspaceFiles.changes`，可选）。
 * 面板用它把自动刷新挂到真实写入上，而不是轮询。
 */
export interface WorkspaceChangeFace {
  changes(sessionId: string, signal?: AbortSignal): AsyncIterable<unknown>
}

/** 引导页入口胶囊（右栏注册表的 guide 条目）。 */
export interface GuideEntryFace {
  order: number
  title: () => string
  description?: () => string
  icon?: ComponentType<{ size?: number; className?: string }>
}

/** 标签类型定义（右栏注册表的静态面）。 */
export interface TabDefinitionFace {
  id: string
  kind: string
  /** 页面类型不声明 patterns；band 默认 extension（社区插件）。 */
  priority?: 'extension' | 'builtin' | 'fallback'
  patterns?: readonly string[]
  title: (address: string) => string
  guide?: readonly GuideEntryFace[]
}

/** 右栏标签类型注册表（ui-sidebar-right 的 ctx.sidebarRightTabs）。 */
export interface TabRegistryFace {
  register(definition: TabDefinitionFace): () => void
}

/** 会话列表状态里本插件读取的切片。 */
export interface SessionSummaryLike {
  cwd?: string
}

export interface SessionListStateLike {
  current?: string
  byId: Record<string, SessionSummaryLike | undefined>
}

/** 框架注入的选择器钩子。 */
export interface SelectorHook<T> {
  <S>(selector: (state: T) => S): S
}

/** 标签体渲染时框架注入的标准 props。 */
export interface GitBodyRuntimeProps {
  sessionId: string
  useSessions: SelectorHook<SessionListStateLike>
}
