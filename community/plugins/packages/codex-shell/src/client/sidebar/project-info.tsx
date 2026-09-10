/**
 * 项目行悬停信息侧弹窗：名称、会话数、绝对路径、编辑入口。
 */

import { Pencil } from 'lucide-react'
import type { TFn } from '../faces.js'
import css from '../styles.module.css'

export interface ProjectInfoProps {
  title: string
  path: string
  sessionCount: number
  pinned: boolean
  onRename: () => void
  onTogglePin: () => void
  t: TFn
}

/** 工作区悬停信息卡。 */
export function ProjectInfoCard(props: ProjectInfoProps): React.ReactNode {
  return (
    <div className={css.projectInfoCard} role="dialog" aria-label={props.t('projectInfo')}>
      <div className={css.projectInfoHead}>
        <span className={css.projectInfoTitle}>{props.title}</span>
        <button
          type="button"
          className={css.iconButton}
          title={props.t('renameWorkspace')}
          aria-label={props.t('renameWorkspace')}
          onClick={event => {
            event.stopPropagation()
            props.onRename()
          }}
        >
          <Pencil size={12} />
        </button>
      </div>
      <div className={css.projectInfoMeta}>
        {props.t('projectSessionCount', { n: props.sessionCount })}
        {props.pinned ? ` · ${props.t('pinProject')}` : ''}
      </div>
      <div className={css.projectInfoPath} title={props.path}>{props.path}</div>
      <button
        type="button"
        className={css.projectInfoPin}
        onClick={event => {
          event.stopPropagation()
          props.onTogglePin()
        }}
      >
        {props.pinned ? props.t('unpinProject') : props.t('pinProject')}
      </button>
    </div>
  )
}
