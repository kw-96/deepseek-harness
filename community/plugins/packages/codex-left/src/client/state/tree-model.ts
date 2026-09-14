/** 项目视图的行模型：把工作区分组投影成项目行（纯数据，不产生 JSX）。 */

import type { ProjectView, SessionId, SessionListStateLike } from '../faces.js'
import type { SessionMetaStore } from './session-meta.js'
import type { BrowserPrefsStore, SortMode } from './prefs.js'
import { orderProjects, projectForPath, sortSessionIds, type GroupsModel } from './groups.js'

/** 一个项目行：排序后的组内会话与新建会话的落点工作区。 */
export interface ProjectRow {
  project: ProjectView
  sessionIds: readonly SessionId[]
  /** 项目首个归属工作区；没有归属工作区时为 undefined（不渲染新建会话按钮）。 */
  workspaceId: string | undefined
}

/** 项目视图的整体行模型。 */
export interface ProjectRowsModel {
  projects: readonly ProjectRow[]
  /** 不属于任何项目的会话（已按当前排序模式重排）。 */
  ungrouped: readonly SessionId[]
}

/**
 * 按项目归组会话并排序。
 * @param input - 工作区分组、项目注册表、会话快照、元数据仓、偏好仓与当前排序模式。
 * @returns 项目行（含没有会话的项目）与未分组会话。
 */
export function buildProjectRows(input: {
  groups: GroupsModel
  projects: readonly ProjectView[]
  list: SessionListStateLike
  meta: SessionMetaStore
  prefs: BrowserPrefsStore
  sort: SortMode
}): ProjectRowsModel {
  const { groups, projects, list, meta, prefs, sort } = input
  const byProject = new Map<string, SessionId[]>()
  // 项目 → 首个归属工作区：新建会话按钮在该工作区中开会话。
  const workspaceByProject = new Map<string, string>()
  const ungrouped: SessionId[] = []
  for (const { workspace, sessions } of groups.grouped) {
    const project = projectForPath(workspace.path, projects)
    if (project === undefined) {
      ungrouped.push(...sessions)
      continue
    }
    if (!workspaceByProject.has(project.projectId)) {
      workspaceByProject.set(project.projectId, workspace.workspaceId)
    }
    const bucket = byProject.get(project.projectId)
    if (bucket === undefined) byProject.set(project.projectId, [...sessions])
    else bucket.push(...sessions)
  }
  // 项目内会话可能来自多个工作区，合并后按当前排序模式整体重排：
  // 置顶优先时置顶先于其余（置顶之间按最近更新），余下按最近更新。
  const sortList = (ids: readonly SessionId[]): SessionId[] => sortSessionIds(ids, list, meta, sort)
  // 项目组恒按 置顶 → 最近活动 排列：最近活动取项目下会话的最大 updatedAt，
  // 无会话的项目回退到注册表 updatedAt（在 orderProjects 内兜底）。
  const recency = (projectId: string): number => {
    let latest = 0
    for (const id of byProject.get(projectId) ?? []) {
      const updatedAt = list.byId[id]?.updatedAt ?? 0
      if (updatedAt > latest) latest = updatedAt
    }
    return latest
  }
  return {
    projects: orderProjects(projects, prefs, recency).map(project => ({
      project,
      sessionIds: sortList(byProject.get(project.projectId) ?? []),
      workspaceId: workspaceByProject.get(project.projectId),
    })),
    ungrouped: sortList(ungrouped),
  }
}
