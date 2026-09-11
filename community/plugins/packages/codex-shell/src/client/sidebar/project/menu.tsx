/**
 * 项目「更多」菜单体：重命名项目 / 管理工作树 / 归档组内会话 / 删除项目。
 */

import { Archive, FolderTree, Pencil, Trash2 } from 'lucide-react'
import type { TFn } from '../../faces.js'
import { MenuItem, MenuSep } from '../menu-flyout.js'
import css from '../../styles.module.css'

/** 项目菜单可执行动作（由浏览器闭包提供）。 */
export interface ProjectMenuActions {
  rename(): void
  manageWorktrees(): void
  archiveAllSessions(): void
  deleteProject(): void
}

export interface ProjectMenuProps {
  actions: ProjectMenuActions
  /** 项目名，显示为菜单顶部提示行。 */
  name: string
  t: TFn
}

/** 渲染项目菜单内容。 */
export function ProjectMenuBody({ actions, name, t }: ProjectMenuProps): React.ReactNode {
  return (
    <>
      <div className={css.menuGroupLabel}>{name}</div>
      <MenuItem icon={<Pencil size={13} />} label={t('renameProject')} onClick={actions.rename} />
      <MenuItem
        icon={<FolderTree size={13} />}
        label={t('manageWorktrees')}
        onClick={actions.manageWorktrees}
      />
      <MenuItem
        icon={<Archive size={13} />}
        label={t('archiveProjectSessions')}
        onClick={actions.archiveAllSessions}
      />
      <MenuSep />
      <MenuItem
        icon={<Trash2 size={13} />}
        label={t('deleteProject')}
        danger
        onClick={actions.deleteProject}
      />
    </>
  )
}
