/** 侧栏会话行（Codex 式单行）：标题 + 悬停显露的相对时间、子代理
 * 展开与更多菜单；置顶/未读为常驻小标记，运行中会话点亮点。 */

import { ChevronDown, ChevronRight, GitFork, MoreHorizontal, Pin } from 'lucide-react'
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
      <div className={className}
        role="treeitem"
        aria-selected={props.current}
        onClick={props.onOpen}
        title={props.cwd ?? props.sessionId}>
        {props.running && <span className={css.dotRunning} />}
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
            <button type="button" className={css.pinMark} title={props.t('unpin')}
              onClick={event => { event.stopPropagation(); updateMeta({ pinned: false }) }}>
              <Pin size={11} />
            </button>
          )}
          {rowMeta.unread && <span className={css.badge} aria-hidden="true" />}
          {props.subagents.length > 0 && (
            <button type="button" className={`${css.iconButton} ${css.reveal}`}
              title={`${props.subagents.length} ${props.t('subagents')}`}
              onClick={event => { event.stopPropagation(); props.onToggleSubagents() }}>
              {props.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
          <button type="button" className={`${css.iconButton} ${css.reveal}`}
            aria-label={props.t('moreActions')}
            onClick={props.onMenu}>
            <MoreHorizontal size={14} />
          </button>
        </span>
      </div>
      {props.expanded && props.subagents.map(sub => (
        <div key={sub.id} className={css.subRow}
          role="treeitem"
          aria-selected={sub.current}
          onClick={() => { props.open(sub.id) }}
          title={sub.id}>
          <GitFork size={11} style={{ flex: 'none', opacity: 0.55 }} />
          <span className={css.rowLabel}>{sub.title}</span>
          {sub.running && <span className={css.dotRunning} />}
        </div>
      ))}
    </>
  )
}
