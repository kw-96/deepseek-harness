/**
 * 宿主服务的本地结构面：社区插件按结构类型对接宿主 seam，不依赖其编排
 * 类型线；运行时的槽位核心与 Right 栏注册表仍会对每个名字做加载期校验。
 */

import type { ComponentType, ReactNode } from 'react'
import type { ChangedResponse, GitLogResponse } from '../types.js'

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
export interface GitTimelineRemoteFace {
  log(cwd: string, path?: string, count?: number): Promise<RemoteResult<GitLogResponse>>
  changed(cwd: string): Promise<RemoteResult<ChangedResponse>>
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

/** 标签体渲染时框架注入的标准 props（locale 座位给的 t 由注册声明补齐）。 */
export interface TimelineBodyRuntimeProps {
  sessionId: string
  useSessions: SelectorHook<SessionListStateLike>
}

/** 渲染一个只读文本节点集合的小工具类型别名。 */
export type Renderable = ReactNode
