/**
 * 侧栏会话行（Codex 式）：标题 + 悬停显露置顶/归档/更多操作；
 * 置顶/未读角标常驻；运行中会话点亮点。
 */

import { Archive, MoreHorizontal, Pin, RotateCcw } from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import { useSessionMeta } from './session-meta.js'
import type { SessionId, TFn } from './faces.js'
import css from './styles.module.css'

export interface SessionRowProps {
  sessionId: SessionId
  title: string
  cwd?: string | undefined
  current: boolean
  running: boolean
  archived: boolean
  renaming: boolean
  renameDraft: string
  setRenameDraft: (value: string) => void
  commitRename: () => void
  onOpen: () => void
  onMenu: (event: React.MouseEvent) => void
  onArchive: () => void
  /** 归档行的恢复动作；未提供时不渲染。 */
  onRestore?: (() => void) | undefined
  draggable: boolean
  onDragStart?: (event: React.DragEvent) => void
  onDragOver?: (event: React.DragEvent) => void
  onDrop?: (event: React.DragEvent) => void
  meta: SessionMetaStore
  t: TFn
}

/** 一条顶层会话行。 */
export function SessionRow(props: SessionRowProps): React.ReactNode {
  const [rowMeta, updateMeta] = useSessionMeta(props.meta, props.sessionId)
  const className = props.archived ? css.rowArchived : props.current ? css.rowCurrent : css.row
  return (
    <div
      className={className}
      role="treeitem"
      tabIndex={0}
      aria-selected={props.current}
      aria-current={props.current ? 'page' : undefined}
      draggable={props.draggable}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onClick={props.onOpen}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          props.onOpen()
        }
      }}
      title={props.cwd ?? props.sessionId}
    >
      <span aria-hidden="true" className={props.running ? css.dotRunning : css.dotSlot} />
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
        : <span className={css.rowLabel}>{props.title}</span>}
      <span className={css.rowMeta}>
        {rowMeta.pinned && (
          <span className={css.pinMark} title={props.t('pin')} aria-hidden="true">
            <Pin size={11} />
          </span>
        )}
        {rowMeta.unread && <span className={css.badge} aria-hidden="true" />}
        {props.archived && props.onRestore !== undefined && (
          <span className={css.rowHoverActions}>
            <button
              type="button"
              className={css.iconButton}
              title={props.t('restoreSession')}
              aria-label={props.t('restoreSession')}
              onClick={event => {
                event.stopPropagation()
                props.onRestore?.()
              }}
            >
              <RotateCcw size={13} />
            </button>
          </span>
        )}
        {!props.archived && (
          <span className={css.rowHoverActions}>
            <button
              type="button"
              className={css.iconButton}
              title={rowMeta.pinned ? props.t('unpin') : props.t('pin')}
              aria-label={rowMeta.pinned ? props.t('unpin') : props.t('pin')}
              onClick={event => {
                event.stopPropagation()
                updateMeta({ pinned: !rowMeta.pinned })
              }}
            >
              <Pin size={13} />
            </button>
            <button
              type="button"
              className={css.iconButton}
              title={props.t('archive')}
              aria-label={props.t('archive')}
              onClick={event => {
                event.stopPropagation()
                props.onArchive()
              }}
            >
              <Archive size={13} />
            </button>
            <button
              type="button"
              className={css.iconButton}
              aria-label={props.t('moreActions')}
              onClick={props.onMenu}
            >
              <MoreHorizontal size={14} />
            </button>
          </span>
        )}
      </span>
    </div>
  )
}
