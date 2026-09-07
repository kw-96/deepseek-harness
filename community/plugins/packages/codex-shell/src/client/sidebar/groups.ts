/**
 * 侧栏分组投影：按整理/排序偏好产出 grouped / flat / archived。
 */

import type { SessionMetaStore } from '../session-meta.js'
import type { BrowserPrefsStore, OrganizeMode, SortMode } from './prefs.js'
import type { SessionId, SessionListStateLike, WorkspaceViewLike } from '../faces.js'
import type { GroupsModel } from '../browser-tree.js'

export interface BuildGroupsInput {
  list: SessionListStateLike
  workspaces: readonly WorkspaceViewLike[]
  archivedIds: readonly SessionId[]
  meta: SessionMetaStore
  prefs: BrowserPrefsStore
  organize: OrganizeMode
  sort: SortMode
}

/** 按偏好构建侧栏分组模型。 */
export function buildGroupsModel(input: BuildGroupsInput): GroupsModel {
  const { list, workspaces, archivedIds, meta, prefs, sort } = input
  const visible = (id: SessionId): boolean => {
    const summary = list.byId[id]
    return summary !== undefined && !summary.blank && !archivedIds.includes(id)
  }
  const orderIndex = new Map(list.ids.map((id, index) => [id, index]))
  const sortIds = (ids: readonly SessionId[]): SessionId[] => {
    const copy = [...ids]
    if (sort === 'manual') {
      return copy.sort((left, right) => (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0))
    }
    copy.sort((left, right) => {
      if (sort === 'pinnedFirst') {
        const pinDiff = Number(meta.meta(right).pinned) - Number(meta.meta(left).pinned)
        if (pinDiff !== 0) return pinDiff
      }
      const diff = (list.byId[right]?.updatedAt ?? 0) - (list.byId[left]?.updatedAt ?? 0)
      if (diff !== 0) return diff
      return (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0)
    })
    return copy
  }

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
