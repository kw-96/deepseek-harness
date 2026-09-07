/**
 * 工作区（项目）标题行：折叠、重命名、悬停更多/重命名、信息侧弹窗。
 */

import { Folder, FolderOpen, MoreHorizontal, Pencil } from 'lucide-react'
import { useState } from 'react'
import type { TFn } from './faces.js'
import { ProjectInfoCard } from './sidebar/project-info.js'
import css from './styles.module.css'

export interface WorkspaceHeadProps {
  label: string
  path: string
  sessionCount: number
  pinned: boolean
  collapsed: boolean
  renaming: boolean
  renameDraft: string
  setRenameDraft: (value: string) => void
  commitRename: () => void
  onToggle: () => void
  onMenu: (event: React.MouseEvent) => void
  onBeginRename: () => void
  onTogglePin: () => void
  t: TFn
}

/** 项目行头部。 */
export function WorkspaceHead(props: WorkspaceHeadProps): React.ReactNode {
  const [info, setInfo] = useState(false)
  const icon = props.collapsed
    ? <Folder size={13} className={css.workspaceIcon} />
    : <FolderOpen size={13} className={css.workspaceIcon} />
  return (
    <div
      className={css.workspaceHead}
      role="treeitem"
      aria-expanded={!props.collapsed}
      onClick={props.onToggle}
      onMouseEnter={() => { setInfo(true) }}
      onMouseLeave={() => { setInfo(false) }}
    >
      {icon}
      {props.renaming
        ? <input
          className={css.search}
          autoFocus
          value={props.renameDraft}
          onChange={event => { props.setRenameDraft(event.target.value) }}
          onBlur={props.commitRename}
          onKeyDown={event => { if (event.key === 'Enter') props.commitRename() }}
          onClick={event => event.stopPropagation()}
        />
        : <span className={css.workspaceLabel}>{props.label}</span>}
      {!props.renaming && (
        <span className={css.workspaceActions}>
          <button
            type="button"
            className={css.iconButton}
            title={props.t('renameWorkspace')}
            aria-label={props.t('renameWorkspace')}
            onClick={event => {
              event.stopPropagation()
              props.onBeginRename()
            }}
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            className={css.iconButton}
            title={props.t('moreActions')}
            aria-label={props.t('moreActions')}
            onClick={event => {
              event.stopPropagation()
              props.onMenu(event)
            }}
          >
            <MoreHorizontal size={13} />
          </button>
        </span>
      )}
      {info && !props.renaming && (
        <div className={css.projectInfoAnchor} onClick={event => event.stopPropagation()}>
          <ProjectInfoCard
            title={props.label}
            path={props.path}
            sessionCount={props.sessionCount}
            pinned={props.pinned}
            onRename={props.onBeginRename}
            onTogglePin={props.onTogglePin}
            t={props.t}
          />
        </div>
      )}
    </div>
  )
}
