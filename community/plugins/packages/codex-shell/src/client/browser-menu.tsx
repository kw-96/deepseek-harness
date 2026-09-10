/**
 * 侧栏行操作菜单外壳：固定定位 + 派发会话/工作区菜单体。
 */

import { useEffect, useRef } from 'react'
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
  const menu = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (state === null) return
    const onPointerDown = (event: PointerEvent): void => {
      if (menu.current !== null && !menu.current.contains(event.target as Node)) onDismiss()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onDismiss, state])
  if (state === null) return null
  const maxLeft = typeof window === 'undefined' ? state.x : Math.max(8, window.innerWidth - 220)
  const maxTop = typeof window === 'undefined' ? state.y : Math.max(8, window.innerHeight - 360)

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
      ref={menu}
      className={css.menu}
      style={{ left: Math.max(8, Math.min(state.x, maxLeft)), top: Math.max(8, Math.min(state.y, maxTop)) }}
      role="menu"
    >
      {body}
    </div>
  )
}
