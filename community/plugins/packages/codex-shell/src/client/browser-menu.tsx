/**
 * 侧栏行操作菜单外壳：固定定位 + 按 kind 派发会话/工作区/项目菜单体。
 */

import { useEffect, useRef } from 'react'
import type { ProjectView, SessionId, TFn } from './faces.js'
import { SessionMenuBody, type SessionMenuActions } from './sidebar/session-menu.js'
import { WorkspaceMenuBody, type WorkspaceMenuActions } from './sidebar/workspace-menu.js'
import { ProjectMenuBody, type ProjectMenuActions } from './sidebar/project/menu.js'
import css from './styles.module.css'

/** 菜单目标：行类型判别值 + 该行身份。 */
export type BrowserMenuTarget =
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'session'; sessionId: SessionId }
  | { kind: 'project'; projectId: string }

export type BrowserMenuState = BrowserMenuTarget & { x: number; y: number }

export interface BrowserMenuProps {
  state: BrowserMenuState | null
  onDismiss: () => void
  sessionActions: ((sessionId: SessionId) => SessionMenuActions) | null
  workspaceActions: ((workspaceId: string) => WorkspaceMenuActions) | null
  projectActions: ((projectId: string) => ProjectMenuActions) | null
  projects: readonly ProjectView[]
  sessionProjectId: (sessionId: SessionId) => string | undefined
  sessionCwd: (sessionId: SessionId) => string | undefined
  /** 项目名（项目菜单提示行）。 */
  projectName: (projectId: string) => string
  t: TFn
}

/** 渲染工作区/会话/项目操作菜单；空状态返回 null。 */
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
  switch (state.kind) {
    case 'workspace':
      body = props.workspaceActions === null
        ? null
        : <WorkspaceMenuBody actions={props.workspaceActions(state.workspaceId)} t={t} />
      break
    case 'session': {
      if (props.sessionActions === null) break
      const sessionId = state.sessionId
      const actions = props.sessionActions(sessionId)
      body = (
        <SessionMenuBody
          actions={{ ...actions, cwd: props.sessionCwd(sessionId) }}
          projects={props.projects}
          currentProjectId={props.sessionProjectId(sessionId)}
          t={t}
        />
      )
      break
    }
    case 'project':
      body = props.projectActions === null
        ? null
        : (
          <ProjectMenuBody
            actions={props.projectActions(state.projectId)}
            name={props.projectName(state.projectId)}
            t={t}
          />
        )
      break
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
