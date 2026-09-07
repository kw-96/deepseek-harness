/**
 * 侧栏会话行（Codex 式）：标题 + 悬停显露相对时间与置顶/归档/更多；
 * 置顶/未读角标常驻；运行中会话点亮点。
 */

import { Archive, ChevronDown, ChevronRight, GitFork, MoreHorizontal, Pin } from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import { useSessionMeta } from './session-meta.js'
import type { SessionId, TFn } from './faces.js'
import css from './styles.module.css'

/** 一条嵌套子代理行的持久事实。 */
export interface SubagentLike {
  id: SessionId
  title: string
  current: boolean
  running: boolean
}

export interface SessionRowProps {
  sessionId: SessionId
  title: string
  timeLabel: string
  cwd?: string | undefined
  current: boolean
  running: boolean
  archived: boolean
  subagents: readonly SubagentLike[]
  expanded: boolean
  onToggleSubagents: () => void
  renaming: boolean
  renameDraft: string
  setRenameDraft: (value: string) => void
  commitRename: () => void
  onOpen: () => void
  onMenu: (event: React.MouseEvent) => void
  onArchive: () => void
  draggable: boolean
  onDragStart?: (event: React.DragEvent) => void
  onDragOver?: (event: React.DragEvent) => void
  onDrop?: (event: React.DragEvent) => void
  meta: SessionMetaStore
  open: (sessionId: SessionId) => void
  t: TFn
}

/** 一条顶层会话行 + 其子代理子树。 */
export function SessionRow(props: SessionRowProps): React.ReactNode {
  const [rowMeta, updateMeta] = useSessionMeta(props.meta, props.sessionId)
  const className = props.archived ? css.rowArchived : props.current ? css.rowCurrent : css.row
  return (
    <>
      <div
        className={className}
        role="treeitem"
        tabIndex={0}
        aria-selected={props.current}
        aria-current={props.current ? 'page' : undefined}
        aria-expanded={props.subagents.length > 0 ? props.expanded : undefined}
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
            return
          }
          if (event.key === 'ArrowRight' && props.subagents.length > 0 && !props.expanded) {
            event.preventDefault()
            props.onToggleSubagents()
            return
          }
          if (event.key === 'ArrowLeft' && props.subagents.length > 0 && props.expanded) {
            event.preventDefault()
            props.onToggleSubagents()
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
          <span className={css.rowTime}>{props.timeLabel}</span>
          {rowMeta.pinned && (
            <span className={css.pinMark} title={props.t('pin')} aria-hidden="true">
              <Pin size={11} />
            </span>
          )}
          {rowMeta.unread && <span className={css.badge} aria-hidden="true" />}
          {props.subagents.length > 0 && (
            <button type="button" className={`${css.iconButton} ${css.reveal}`}
              title={`${props.subagents.length} ${props.t('subagents')}`}
              onClick={event => { event.stopPropagation(); props.onToggleSubagents() }}>
              {props.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
          {!props.archived && (
            <span className={`${css.rowHoverActions} ${css.reveal}`}>
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
      {props.expanded && props.subagents.map(sub => (
        <div key={sub.id} className={css.subRow}
          role="treeitem"
          tabIndex={0}
          aria-selected={sub.current}
          onClick={() => { props.open(sub.id) }}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              props.open(sub.id)
            }
          }}
          title={sub.id}>
          <GitFork size={11} style={{ flex: 'none', opacity: 0.55 }} />
          <span className={css.rowLabel}>{sub.title}</span>
          {sub.running && <span className={css.dotRunning} />}
        </div>
      ))}
    </>
  )
}
