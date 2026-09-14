/**
 * 项目相关的动作：会话归属解析、项目归并动作与项目行菜单。
 */

import type { ProjectView, SessionId, WorkspaceViewLike } from '../faces.js'
import { pathKey, projectForPath } from '../state/groups.js'
import type { ProjectMenuActions } from '../overlays/project-menu.js'
import type { BrowserActionDeps } from './actions.js'

/** 会话所属工作区 id。 */
export function sessionWorkspaceId(
  workspaces: readonly WorkspaceViewLike[],
  sessionId: SessionId,
): string | undefined {
  return workspaces.find(ws => ws.sessionIds.includes(sessionId))?.workspaceId
}

/** 项目下所有会话：按项目 roots 前缀命中的工作区汇总。 */
export function projectSessionIds(
  workspaces: readonly WorkspaceViewLike[],
  projects: readonly ProjectView[],
  projectId: string,
): readonly SessionId[] {
  const project = projects.find(item => item.projectId === projectId)
  if (project === undefined) return []
  return workspaces
    .filter(ws => projectForPath(ws.path, [project]) !== undefined)
    .flatMap(ws => ws.sessionIds)
}

/**
 * 把会话归并到项目：确保它挂在该项目下的工作区里。
 * 1) 项目下已有一个工作区与会话目录一致 → 直接移入（真正的多工作树命中）；
 * 2) 否则落入项目基本盘（首个归属工作区）；
 * 3) 项目还没有任何工作区时，以会话目录补建工作区并纳入项目 roots，再移入。
 * @param deps - 动作依赖（会话快照、工作区、项目与写入动作）。
 * @param sessionId - 待归并的会话。
 * @param projectId - 目标项目。
 */
export async function moveSessionToProject(
  deps: BrowserActionDeps,
  sessionId: SessionId,
  projectId: string,
): Promise<void> {
  const project = deps.projects.find(item => item.projectId === projectId)
  if (project === undefined) return
  const cwd = deps.list.byId[sessionId]?.cwd
  const owned = deps.workspaces.filter(ws => projectForPath(ws.path, [project]) !== undefined)
  const matching = cwd === undefined || cwd === ''
    ? undefined
    : owned.find(ws => pathKey(ws.path) === pathKey(cwd))
  if (matching !== undefined) {
    await deps.moveSession(matching.workspaceId, sessionId)
    return
  }
  if (owned.length > 0) {
    await deps.moveSession(owned[0]!.workspaceId, sessionId)
    return
  }
  if (cwd === undefined || cwd === '') return
  const created = await deps.createWorkspace({ path: cwd })
  if (!project.roots.some(root => pathKey(root) === pathKey(created.path))) {
    await deps.setProjectRoots(projectId, [...project.roots, created.path])
    await deps.refreshProjects()
  }
  await deps.moveSession(created.workspaceId, sessionId)
}

/**
 * 项目行「更多」菜单的动作。
 * @param deps - 动作依赖。
 * @param projectId - 目标项目。
 */
export function buildProjectActions(deps: BrowserActionDeps, projectId: string): ProjectMenuActions {
  const project = deps.projects.find(item => item.projectId === projectId)
  const name = project?.name ?? ''
  const close = deps.closeMenu
  return {
    rename: () => {
      close()
      const next = window.prompt(deps.t('renameProject'), name)
      if (next === null || next.trim() === '' || next.trim() === name) return
      void deps.renameProject(projectId, next.trim()).then(() => deps.refreshProjects()).catch(() => { /* 保留旧名 */ })
    },
    manageWorktrees: () => { close(); deps.setWorktreeProjectId(projectId) },
    archiveAllSessions: () => {
      close()
      for (const sessionId of projectSessionIds(deps.workspaces, deps.projects, projectId)) {
        void deps.archiveSession(sessionId)
      }
    },
    deleteProject: () => {
      close()
      if (!window.confirm(deps.t('deleteProjectConfirm', { name }))) return
      void deps.deleteProject(projectId).then(() => deps.refreshProjects()).catch(() => { /* 删除失败保留项目 */ })
    },
  }
}
