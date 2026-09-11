/**
 * 宿主服务的本地结构面：社区插件按结构类型对接宿主 seam，不依赖其编排
 * 类型线；槽位核心与右栏注册表在加载期仍会校验每个名字。
 */

import type { ComponentType } from 'react'
import type {
  BrowserInterruptResult, BrowserLiveView, BrowserPanelSnapshot, BrowserPreviewResult, BrowserStopResult,
  BrowserTabView,
} from '../types.js'

export type TFn = (key: string, params?: Record<string, unknown>) => string

/** 文案服务。 */
export interface LocaleFace {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  bind(namespace: string): TFn
}

/** 槽位服务（本插件只用到注入与注册两个动作）。 */
export interface SlotsFace {
  inject(name: string, setup: () => (() => void) | undefined): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** Remote 服务：挂载贡献并暴露命名空间。 */
export interface RemoteFace {
  $mount(contribution: unknown): Promise<() => Promise<void>>
}

/** Remote 调用结果。 */
export type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

/** 本插件自己的 Remote 命名空间面。 */
export interface BrowserAgentRemoteFace {
  panel(sessionId: string): Promise<RemoteResult<BrowserPanelSnapshot>>
  stop(sessionId: string): Promise<RemoteResult<BrowserStopResult>>
  preview(sessionId: string): Promise<RemoteResult<BrowserPreviewResult>>
  live(sessionId: string): Promise<RemoteResult<BrowserLiveView>>
  interrupt(sessionId: string): Promise<RemoteResult<BrowserInterruptResult>>
}

/** 解包后的面板 API：组件直接消费的形态。 */
export interface BrowserPanelApi {
  panel(sessionId: string): Promise<BrowserPanelSnapshot>
  stop(sessionId: string): Promise<BrowserStopResult>
  preview(sessionId: string): Promise<BrowserPreviewResult>
  live(sessionId: string): Promise<BrowserLiveView>
  interrupt(sessionId: string): Promise<BrowserInterruptResult>
}

/** 引导页入口胶囊。 */
export interface GuideEntryFace {
  order: number
  title: () => string
  description?: () => string
  icon?: ComponentType<{ size?: number; className?: string }>
}

/** 右栏标签类型定义。 */
export interface TabDefinitionFace {
  id: string
  kind: string
  priority?: 'extension' | 'builtin' | 'fallback'
  patterns?: readonly string[]
  title: (address: string) => string
  guide?: readonly GuideEntryFace[]
}

/** 右栏标签类型注册表。 */
export interface TabRegistryFace {
  register(definition: TabDefinitionFace): () => void
}

/** 面板标签页行（供渲染收窄）。 */
export type TabRow = BrowserTabView
