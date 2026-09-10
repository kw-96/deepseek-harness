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
 * 项目组排序：置顶优先时置顶在前（置顶之间按最近更新），
 * 其余按项目 updatedAt 倒序；最近更新模式只看 updatedAt；
 * 手动模式保持注册表顺序。
 * @param projects - 宿主项目注册表顺序。
 * @param prefs - 项目置顶状态仓。
 * @param sort - 当前排序模式。
 * @returns 排序后的新数组。
 */
export function orderProjects(
  projects: readonly ProjectView[],
  prefs: BrowserPrefsStore,
  sort: SortMode,
): ProjectView[] {
  if (sort === 'manual') return [...projects]
  const time = (project: ProjectView): number => Date.parse(project.updatedAt) || 0
  return [...projects].sort((left, right) => {
    if (sort === 'pinnedFirst') {
      const pinDiff = Number(prefs.projectPinned(right.projectId))
        - Number(prefs.projectPinned(left.projectId))
      if (pinDiff !== 0) return pinDiff
    }
    return time(right) - time(left)
  })
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
