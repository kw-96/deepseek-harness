/**
 * 侧栏整理/排序偏好与项目置顶：独立于 SessionMeta 的 localStorage 仓。
 */

import { useCallback, useEffect, useState } from 'react'
import { readPersisted, writePersisted } from '../persistence.js'

/** 侧栏整理：按项目分组，或扁平单列表。 */
export type OrganizeMode = 'byProject' | 'flat'

/** 聊天排序：置顶优先 / 最近更新 / 手动拖拽。 */
export type SortMode = 'pinnedFirst' | 'recent' | 'manual'

interface PrefsFile {
  organize: OrganizeMode
  sort: SortMode
  workspacePinned: Record<string, boolean>
  /** 项目置顶（按项目分组视图的 ProjectView）。 */
  projectPinned?: Record<string, boolean>
  /** 收起的组键集合（项目/工作区/归档桶），数组序列化以兼容 JSON。 */
  collapsedGroups?: string[]
  /** 自动归档阈值（天）：会话超过该天数无活动即自动归档；0 表示关闭。 */
  autoArchiveDays?: number
}

/** 自动归档默认阈值（天）。 */
export const DEFAULT_AUTO_ARCHIVE_DAYS = 30

const PREFS_KEY = 'dsh-codex-shell.browser-prefs.v1'

const DEFAULTS: PrefsFile = {
  organize: 'byProject',
  sort: 'pinnedFirst',
  workspacePinned: {},
  projectPinned: {},
  collapsedGroups: [],
  autoArchiveDays: DEFAULT_AUTO_ARCHIVE_DAYS,
}

/**
 * 侧栏浏览器偏好仓。
 * 与 SessionMeta 分键，避免 meta 版本迁移误伤整理偏好。
 */
export class BrowserPrefsStore {
  private data: PrefsFile

  constructor() {
    this.data = { ...DEFAULTS, ...readPersisted<Partial<PrefsFile>>(PREFS_KEY, {}) }
    this.data.workspacePinned = this.data.workspacePinned ?? {}
    this.data.projectPinned = this.data.projectPinned ?? {}
  }

  /** 当前整理模式。 */
  get organize(): OrganizeMode {
    return this.data.organize
  }

  /** 当前排序模式。 */
  get sort(): SortMode {
    return this.data.sort
  }

  /** 自动归档阈值（天）；0 表示关闭。 */
  get autoArchiveDays(): number {
    const value = this.data.autoArchiveDays
    return typeof value === 'number' && value >= 0 ? value : DEFAULT_AUTO_ARCHIVE_DAYS
  }

  /** 写入自动归档阈值（0 关闭）。 */
  setAutoArchiveDays(days: number): void {
    this.data = { ...this.data, autoArchiveDays: Math.max(0, Math.floor(days)) }
    this.persist()
  }

  /** 某工作区是否本地置顶。 */
  workspacePinned(workspaceId: string): boolean {
    return this.data.workspacePinned[workspaceId] === true
  }

  /** 某项目是否本地置顶。 */
  projectPinned(projectId: string): boolean {
    return this.data.projectPinned?.[projectId] === true
  }

  /** 切换项目本地置顶。 */
  setProjectPinned(projectId: string, pinned: boolean): void {
    const next = { ...(this.data.projectPinned ?? {}) }
    if (pinned) next[projectId] = true
    else delete next[projectId]
    this.data = { ...this.data, projectPinned: next }
    this.persist()
  }

  /** 当前收起的组键集合。 */
  collapsedGroups(): ReadonlySet<string> {
    return new Set(this.data.collapsedGroups ?? [])
  }

  /** 覆盖写入收起组键集合（项目/工作区/归档桶），供刷新后恢复。 */
  setCollapsedGroups(keys: readonly string[]): void {
    this.data = { ...this.data, collapsedGroups: [...keys] }
    this.persist()
  }

  /** 写入整理模式。 */
  setOrganize(mode: OrganizeMode): void {
    this.data = { ...this.data, organize: mode }
    this.persist()
  }

  /** 写入排序模式。 */
  setSort(mode: SortMode): void {
    this.data = { ...this.data, sort: mode }
    this.persist()
  }

  /** 切换工作区本地置顶。 */
  setWorkspacePinned(workspaceId: string, pinned: boolean): void {
    const next = { ...this.data.workspacePinned }
    if (pinned) next[workspaceId] = true
    else delete next[workspaceId]
    this.data = { ...this.data, workspacePinned: next }
    this.persist()
  }

  private persist(): void {
    writePersisted(PREFS_KEY, JSON.stringify(this.data))
  }
}

/** 偏好快照：整理模式、排序模式与自动归档阈值。 */
export interface BrowserPrefsSnapshot {
  organize: OrganizeMode
  sort: SortMode
  autoArchiveDays: number
}

/** 订阅偏好变更（组件内本地快照）。 */
export function useBrowserPrefs(store: BrowserPrefsStore): [
  BrowserPrefsSnapshot,
  (patch: Partial<BrowserPrefsSnapshot>) => void,
] {
  const snapshot = (): BrowserPrefsSnapshot =>
    ({ organize: store.organize, sort: store.sort, autoArchiveDays: store.autoArchiveDays })
  const [snap, setSnap] = useState(snapshot)
  useEffect(() => {
    setSnap(snapshot())
  }, [store])
  const update = useCallback((patch: Partial<BrowserPrefsSnapshot>) => {
    if (patch.organize !== undefined) store.setOrganize(patch.organize)
    if (patch.sort !== undefined) store.setSort(patch.sort)
    if (patch.autoArchiveDays !== undefined) store.setAutoArchiveDays(patch.autoArchiveDays)
    setSnap(snapshot())
  }, [store])
  return [snap, update]
}
