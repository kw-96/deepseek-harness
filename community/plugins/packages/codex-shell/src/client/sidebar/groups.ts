/**
 * 侧栏分组投影：按整理/排序偏好产出 grouped / flat / archived。
 * 会话排序规则独立导出，供工作区内部与项目级合并列表共用。
 */

import type { SessionMetaStore } from '../session-meta.js'
import type { BrowserPrefsStore, OrganizeMode, SortMode } from './prefs.js'
import type { ProjectView, SessionId, SessionListStateLike, WorkspaceViewLike } from '../faces.js'

/** 分组投影结果。 */
export interface GroupsModel {
  grouped: { workspace: WorkspaceViewLike; sessions: SessionId[] }[]
  ungrouped: SessionId[]
  archived: SessionId[]
  flat: SessionId[]
}

export interface BuildGroupsInput {
  list: SessionListStateLike
  workspaces: readonly WorkspaceViewLike[]
  archivedIds: readonly SessionId[]
  meta: SessionMetaStore
  prefs: BrowserPrefsStore
  organize: OrganizeMode
  sort: SortMode
}

/**
 * 会话排序比较器：置顶优先时置顶在前（置顶之间按最近更新），
 * 其余按最近更新倒序，同时刻按列表顺序兜底；手动模式只看列表顺序。
 * @param list - 会话列表快照（提供列表顺序与 updatedAt）。
 * @param meta - 会话置顶状态仓。
 * @param sort - 当前排序模式。
 * @returns 两个会话 id 的比较函数。
 */
export function sessionComparator(
  list: SessionListStateLike,
  meta: SessionMetaStore,
  sort: SortMode,
): (left: SessionId, right: SessionId) => number {
  const orderIndex = new Map(list.ids.map((id, index) => [id, index]))
  return (left, right) => {
    if (sort === 'manual') {
      return (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0)
    }
    if (sort === 'pinnedFirst') {
      const pinDiff = Number(meta.meta(right).pinned) - Number(meta.meta(left).pinned)
      if (pinDiff !== 0) return pinDiff
    }
    const diff = (list.byId[right]?.updatedAt ?? 0) - (list.byId[left]?.updatedAt ?? 0)
    if (diff !== 0) return diff
    return (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0)
  }
}

/**
 * 复制一份会话 id 并按当前排序模式重排；不修改入参数组。
 * @param ids - 待排序的会话 id 列表。
 * @returns 排序后的新数组。
 */
export function sortSessionIds(
  ids: readonly SessionId[],
  list: SessionListStateLike,
  meta: SessionMetaStore,
  sort: SortMode,
): SessionId[] {
  return [...ids].sort(sessionComparator(list, meta, sort))
}

/**
 * 项目组排序：**恒为 置顶 → 最近活动 → 兜底**（项目没有拖拽排序，
 * 因此不受会话排序模式影响）。最近活动由调用方给出（项目下会话的
 * 最大 updatedAt，无会话时回退项目注册表 updatedAt）。
 * @param projects - 宿主项目注册表顺序。
 * @param prefs - 项目置顶状态仓。
 * @param recency - 返回某项目的最近活动时间（epoch ms，取不到为 0）。
 * @returns 排序后的新数组。
 */
export function orderProjects(
  projects: readonly ProjectView[],
  prefs: BrowserPrefsStore,
  recency: (projectId: string) => number,
): ProjectView[] {
  return [...projects].sort((left, right) => {
    const pinDiff = Number(prefs.projectPinned(right.projectId))
      - Number(prefs.projectPinned(left.projectId))
    if (pinDiff !== 0) return pinDiff
    const timeDiff = recency(right.projectId) - recency(left.projectId)
    if (timeDiff !== 0) return timeDiff
    const fallback = (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0)
    if (fallback !== 0) return fallback
    return 0
  })
}

/** Normalize a directory path for matching: uniform separators, no trailing separator, case-folded on Windows-style paths. */
export function pathKey(value: string): string {
  return value.replace(/\//g, '\\').replace(/\\+$/u, '').toLowerCase()
}

/**
 * Resolve the project owning one directory path by longest root prefix.
 * @param path - workspace or session directory path.
 * @param projects - project registry rows.
 * @returns the owning project, or undefined when no root matches.
 */
export function projectForPath(path: string, projects: readonly ProjectView[]): ProjectView | undefined {
  const key = pathKey(path)
  let best: ProjectView | undefined
  let bestLength = 0
  for (const project of projects) {
    for (const root of project.roots) {
      const rootKey = pathKey(root)
      if (rootKey === '' || (key !== rootKey && !key.startsWith(rootKey + '\\'))) continue
      if (rootKey.length < bestLength) continue
      best = project
      bestLength = rootKey.length
    }
  }
  return best
}

/** 按偏好构建侧栏分组模型。 */
export function buildGroupsModel(input: BuildGroupsInput): GroupsModel {
  const { list, workspaces, archivedIds, meta, prefs, sort } = input
  const visible = (id: SessionId): boolean => {
    const summary = list.byId[id]
    return summary !== undefined && !summary.blank && !archivedIds.includes(id)
  }
  const sortIds = (ids: readonly SessionId[]): SessionId[] =>
    sortSessionIds(ids, list, meta, sort)

  const topLevel = new Set<SessionId>()
  for (const id of list.ids) {
    const summary = list.byId[id]
    if (summary === undefined || summary.blank) continue
    if (summary.origin !== 'subagent') topLevel.add(id)
    else if (!(summary.parentId !== undefined && visible(summary.parentId))) topLevel.add(id)
  }

  const accounted = new Set<string>()
  const groupedRaw = workspaces.map(workspace => {
    for (const id of workspace.sessionIds) accounted.add(id)
    const sessions = sortIds(workspace.sessionIds.filter(id => topLevel.has(id) && !archivedIds.includes(id)))
    return { workspace, sessions }
  })

  const grouped = [...groupedRaw].sort((left, right) => {
    const pinDiff = Number(prefs.workspacePinned(right.workspace.workspaceId))
      - Number(prefs.workspacePinned(left.workspace.workspaceId))
    if (pinDiff !== 0) return pinDiff
    return 0
  })

  const ungrouped = sortIds([...topLevel].filter(id => !accounted.has(id) && !archivedIds.includes(id)))
  const archived = sortIds(archivedIds.filter(id => list.byId[id] !== undefined))
  const flat = sortIds([
    ...grouped.flatMap(g => g.sessions),
    ...ungrouped,
  ])
  return { grouped, ungrouped, archived, flat }
}
