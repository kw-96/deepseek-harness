/** 右侧停靠面板的开合状态与激活标签页，浏览器本地持久化。 */

import { useSyncExternalStore } from 'react'

export type PanelKind = 'files' | 'git' | 'projects' | 'plugins' | 'mcp' | 'skills' | 'commands' | 'summary' | 'browser'

export interface PanelState {
  open: boolean
  tab: PanelKind
}

const STORAGE_KEY = 'dsh-codex-shell.panel.v1'

/**
 * 面板可见性与激活标签页控制器。首次激活默认展开（三栏工作区直接呈现），
 * 用户手动开合后的偏好写入 localStorage。纯状态类：宿主 details 列的实际
 * 开合由注入的 setColumnOpen 回调驱动，本类不感知布局服务。
 */
export class PanelController {
  private readonly listeners = new Set<() => void>()
  private state: PanelState

  constructor() {
    let saved: PanelState | undefined
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw !== null) saved = JSON.parse(raw) as PanelState
    } catch {
      // 缺失或损坏的偏好回退到默认值。
    }
    this.state = saved ?? { open: true, tab: 'files' }
  }

  getSnapshot(): PanelState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** 切换面板开合；指定标签页时若已在该页则关闭，否则打开并切页。 */
  toggle(tab?: PanelKind): PanelState {
    const next = this.state.open && (tab === undefined || tab === this.state.tab)
      ? { open: false, tab: this.state.tab }
      : { open: true, tab: tab ?? this.state.tab }
    this.commit(next)
    return next
  }

  /** 打开面板（可切页）；返回最新状态供调用方同步布局列。 */
  open(tab?: PanelKind): PanelState {
    if (!this.state.open || (tab !== undefined && tab !== this.state.tab)) {
      this.commit({ open: true, tab: tab ?? this.state.tab })
    }
    return this.state
  }

  /** 关闭面板；返回最新状态供调用方同步布局列。 */
  close(): PanelState {
    if (this.state.open) this.commit({ ...this.state, open: false })
    return this.state
  }

  private commit(next: PanelState): void {
    this.state = next
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* 持久化尽力而为 */ }
    for (const listener of this.listeners) listener()
  }

  dispose(): void {
    this.listeners.clear()
  }
}

/** 面板状态响应式镜像。 */
export function usePanelState(panel: PanelController): [PanelState, PanelController] {
  const state = useSyncExternalStore(
    callback => panel.subscribe(callback),
    () => panel.getSnapshot(),
    () => ({ open: false, tab: 'files' as PanelKind }),
  )
  return [state, panel]
}
