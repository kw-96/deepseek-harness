/** 侧栏行操作菜单（工作区/会话）：… 按钮派发，固定定位弹出面板。 */

import { Archive, ExternalLink, Folder, FolderPlus, GitFork, Hash, Link2, Pencil, Trash2 } from 'lucide-react'
import type { SessionId, TFn } from './faces.js'
import css from './styles.module.css'

export interface BrowserMenuState {
  x: number
  y: number
  sessionId?: SessionId
  workspaceId?: string
  isWorkspace: boolean
}

/** 菜单派发的全部动作（由浏览器组件闭包提供）。 */
export interface BrowserMenuActions {
  startSessionInWorkspace(workspaceId: string): void
  renameWorkspace(workspaceId: string): void
  deleteWorkspace(workspaceId: string): void
  forkSession(sessionId: SessionId): void
  renameSession(sessionId: SessionId): void
  archiveSession(sessionId: SessionId): void
  copyCwd(sessionId: SessionId): void
  copyId(sessionId: SessionId): void
  copyLink(sessionId: SessionId): void
  openNewWindow(sessionId: SessionId): void
}

export interface BrowserMenuProps {
  state: BrowserMenuState | null
  onDismiss: () => void
  actions: BrowserMenuActions
  t: TFn
}

/** 渲染工作区或会话的操作菜单；空状态返回 null。 */
export function BrowserMenu({ state, onDismiss, actions, t }: BrowserMenuProps): React.ReactNode {
  if (state === null) return null
  return <div className={css.menu} style={{ left: state.x, top: state.y }} onMouseLeave={onDismiss}>
    {state.isWorkspace && state.workspaceId !== undefined && (
      <>
        <button type="button" className={css.menuItem} onClick={() => { actions.startSessionInWorkspace(state.workspaceId as string) }}>
          <FolderPlus size={13} className={css.menuIcon} />{t('newSessionInWorkspace')}
        </button>
        <button type="button" className={css.menuItem} onClick={() => { actions.renameWorkspace(state.workspaceId as string) }}>
          <Pencil size={13} className={css.menuIcon} />{t('renameWorkspace')}
        </button>
        <button type="button" className={css.menuItemDanger} onClick={() => { actions.deleteWorkspace(state.workspaceId as string) }}>
          <Trash2 size={13} className={css.menuIcon} />{t('deleteWorkspace')}
        </button>
      </>
    )}
    {!state.isWorkspace && state.sessionId !== undefined && (
      <>
        <button type="button" className={css.menuItem} onClick={() => { actions.forkSession(state.sessionId as SessionId) }}>
          <GitFork size={13} className={css.menuIcon} />{t('forkSession')}
        </button>
        <button type="button" className={css.menuItem} onClick={() => { actions.renameSession(state.sessionId as SessionId) }}>
          <Pencil size={13} className={css.menuIcon} />{t('rename')}
        </button>
        <button type="button" className={css.menuItem} onClick={() => { actions.archiveSession(state.sessionId as SessionId) }}>
          <Archive size={13} className={css.menuIcon} />{t('archive')}
        </button>
        <div className={css.menuSep} />
        <button type="button" className={css.menuItem} onClick={() => { actions.copyCwd(state.sessionId as SessionId) }}>
          <Folder size={13} className={css.menuIcon} />{t('copyCwd')}
        </button>
        <button type="button" className={css.menuItem} onClick={() => { actions.copyId(state.sessionId as SessionId) }}>
          <Hash size={13} className={css.menuIcon} />{t('copyId')}
        </button>
        <button type="button" className={css.menuItem} onClick={() => { actions.copyLink(state.sessionId as SessionId) }}>
          <Link2 size={13} className={css.menuIcon} />{t('copyLink')}
        </button>
        <button type="button" className={css.menuItem} onClick={() => { actions.openNewWindow(state.sessionId as SessionId) }}>
          <ExternalLink size={13} className={css.menuIcon} />{t('openInNewWindow')}
        </button>
      </>
    )}
  </div>
}
