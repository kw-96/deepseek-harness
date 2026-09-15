/** 侧栏浏览器的浮层：嵌套菜单宿主与两个项目弹窗。 */

import type { FsListResponse } from 'dsh-workspace-rail/types'
import type { ProjectView, SessionId, TFn, WorkspaceViewLike } from '../faces.js'
import { BrowserMenu, type BrowserMenuState } from '../overlays/browser-menu.js'
import type { ProjectMenuActions } from '../overlays/project-menu.js'
import type { SessionMenuActions } from '../overlays/session-menu.js'
import type { WorkspaceMenuActions } from '../overlays/workspace-menu.js'
import { ProjectCreateModal } from '../overlays/dialogs/create-modal.js'
import { ProjectWorktreesModal } from '../overlays/dialogs/worktrees-modal.js'

/** 浮层属性：菜单状态与动作、新建项目弹窗与管理工作树弹窗的数据源。 */
export interface BrowserOverlaysProps {
  menu: BrowserMenuState | null
  onDismissMenu: () => void
  sessionActions: ((sessionId: SessionId) => SessionMenuActions) | null
  workspaceActions: ((workspaceId: string) => WorkspaceMenuActions) | null
  projectActions: ((projectId: string) => ProjectMenuActions) | null
  projects: readonly ProjectView[]
  sessionProjectId: (sessionId: SessionId) => string | undefined
  sessionCwd: (sessionId: SessionId) => string | undefined
  projectName: (projectId: string) => string
  createProjectOpen: boolean
  onCloseCreateProject: () => void
  worktreeProject: ProjectView | null
  onCloseWorktrees: () => void
  workspaces: readonly WorkspaceViewLike[]
  fsList: (path: string) => Promise<FsListResponse>
  createWorkspace: (input: { path: string }) => Promise<{ workspaceId: string, path: string }>
  createProject: (name: string, roots?: readonly string[]) => Promise<{ project: ProjectView }>
  onProjectsChanged: () => Promise<void>
  setProjectRoots: (projectId: string, roots: readonly string[]) => Promise<{ project: ProjectView }>
  t: TFn
}

/** 渲染菜单与弹窗。 */
export function BrowserOverlays(props: BrowserOverlaysProps): React.ReactNode {
  return (
    <>
      <BrowserMenu
        state={props.menu}
        onDismiss={props.onDismissMenu}
        sessionActions={props.sessionActions}
        workspaceActions={props.workspaceActions}
        projectActions={props.projectActions}
        projects={props.projects}
        sessionProjectId={props.sessionProjectId}
        sessionCwd={props.sessionCwd}
        projectName={props.projectName}
        t={props.t}
      />
      <ProjectCreateModal
        open={props.createProjectOpen}
        workspaces={props.workspaces}
        fsList={props.fsList}
        createWorkspace={props.createWorkspace}
        createProject={props.createProject}
        onCreated={() => { void props.onProjectsChanged() }}
        onClose={props.onCloseCreateProject}
        t={props.t}
      />
      <ProjectWorktreesModal
        project={props.worktreeProject}
        workspaces={props.workspaces}
        fsList={props.fsList}
        onSave={async (projectId, roots) => {
          await props.setProjectRoots(projectId, roots)
          await props.onProjectsChanged()
        }}
        onClose={props.onCloseWorktrees}
        t={props.t}
      />
    </>
  )
}
