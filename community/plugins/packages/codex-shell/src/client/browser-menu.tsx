/**
 * 侧栏行操作菜单外壳：固定定位 + 派发会话/工作区菜单体。
 */

import type { SessionId, TFn, WorkspaceViewLike } from './faces.js'
import { SessionMenuBody, type SessionMenuActions } from './sidebar/session-menu.js'
import { WorkspaceMenuBody, type WorkspaceMenuActions } from './sidebar/workspace-menu.js'
import css from './styles.module.css'

export interface BrowserMenuState {
  x: number
  y: number
  sessionId?: SessionId
  workspaceId?: string
  isWorkspace: boolean
}

export interface BrowserMenuProps {
  state: BrowserMenuState | null
  onDismiss: () => void
  sessionActions: ((sessionId: SessionId) => SessionMenuActions) | null
  workspaceActions: ((workspaceId: string) => WorkspaceMenuActions) | null
  workspaces: readonly WorkspaceViewLike[]
  sessionWorkspaceId: (sessionId: SessionId) => string | undefined
  sessionCwd: (sessionId: SessionId) => string | undefined
  t: TFn
}

/** 渲染工作区或会话操作菜单；空状态返回 null。 */
export function BrowserMenu(props: BrowserMenuProps): React.ReactNode {
  const { state, onDismiss, t } = props
  if (state === null) return null

  let body: React.ReactNode = null
  if (state.isWorkspace && state.workspaceId !== undefined && props.workspaceActions !== null) {
    body = <WorkspaceMenuBody actions={props.workspaceActions(state.workspaceId)} t={t} />
  } else if (!state.isWorkspace && state.sessionId !== undefined && props.sessionActions !== null) {
    const sessionId = state.sessionId
    const actions = props.sessionActions(sessionId)
    body = (
      <SessionMenuBody
        actions={{ ...actions, cwd: props.sessionCwd(sessionId) }}
        workspaces={props.workspaces}
        currentWorkspaceId={props.sessionWorkspaceId(sessionId)}
        t={t}
      />
    )
  }

  return (
    <div
      className={css.menu}
      style={{ left: state.x, top: state.y }}
      onMouseLeave={onDismiss}
    >
      {body}
    </div>
  )
}
