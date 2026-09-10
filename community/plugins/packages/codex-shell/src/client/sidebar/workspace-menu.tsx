/**
 * 项目（工作区）更多菜单：置顶/编辑/资源管理器/归档组内会话/移除；
 * 「创建永久工作树」禁用并说明。
 */

import { Archive, FolderOpen, Pencil, Pin, Trash2 } from 'lucide-react'
import type { TFn } from '../faces.js'
import { MenuItem, MenuSep } from './menu-flyout.js'

/** 工作区菜单动作。 */
export interface WorkspaceMenuActions {
  togglePin(): void
  rename(): void
  openInExplorer(): void
  archiveAllSessions(): void
  deleteWorkspace(): void
  startSession(): void
  pinned: boolean
}

export interface WorkspaceMenuProps {
  actions: WorkspaceMenuActions
  t: TFn
}

/** 渲染工作区菜单内容。 */
export function WorkspaceMenuBody(props: WorkspaceMenuProps): React.ReactNode {
  const { actions, t } = props
  return (
    <>
      <MenuItem
        icon={<Pin size={13} />}
        label={actions.pinned ? t('unpinProject') : t('pinProject')}
        onClick={actions.togglePin}
      />
      <MenuItem icon={<Pencil size={13} />} label={t('renameWorkspace')} onClick={actions.rename} />
      <MenuItem
        icon={<FolderOpen size={13} />}
        label={t('openInExplorer')}
        onClick={actions.openInExplorer}
      />
      <MenuItem
        icon={<Archive size={13} />}
        label={t('archiveProjectSessions')}
        onClick={actions.archiveAllSessions}
      />
      <MenuSep />
      <MenuItem
        label={t('createPermanentWorktree')}
        disabled
        disabledReason={t('needHostWorktree')}
      />
      <MenuItem
        icon={<FolderOpen size={13} />}
        label={t('newSessionInWorkspace')}
        onClick={actions.startSession}
      />
      <MenuItem
        icon={<Trash2 size={13} />}
        label={t('deleteWorkspace')}
        danger
        onClick={actions.deleteWorkspace}
      />
    </>
  )
}
