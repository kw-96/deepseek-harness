/** 树体的展示件：项目组、工作区组、归档/未分组桶、搜索结果与空态。 */

import { Archive, Folder, FolderOpen, Inbox, MessageSquarePlus, MoreHorizontal, Pin } from 'lucide-react'
import type {
  ProjectView, SearchResultLike, SessionId, SessionListStateLike, TFn, WorkspaceViewLike,
} from '../../faces.js'
import { WorkspaceHead } from './workspace-head.js'
import css from '../../styles.module.css'

/** 会话行渲染器：由树体提供（含重命名、拖拽与菜单绑定）。 */
export type RowRenderer = (sessionId: SessionId, archived?: boolean, workspaceId?: string) => React.ReactNode

/** 归档桶与未分组桶共用的折叠标题行。 */
export function BucketGroup(props: {
  label: string
  rows: readonly SessionId[]
  collapsed: boolean
  archived?: boolean
  onToggle: () => void
  renderRow: RowRenderer
}): React.ReactNode {
  const { label, rows, collapsed, archived = false, onToggle, renderRow } = props
  return (
    <div className={css.workspaceGroup}>
      <button type="button" className={css.workspaceHead} role="treeitem" aria-expanded={!collapsed}
        onClick={onToggle}>
        <Archive size={13} className={css.workspaceIcon} />
        <span className={css.workspaceLabel}>{label}</span>
      </button>
      {!collapsed && rows.map(id => renderRow(id, archived))}
    </div>
  )
}

/** 工作区组：名称行（可重命名、置顶、菜单）与组内会话行。 */
export function WorkspaceGroup(props: {
  workspace: WorkspaceViewLike
  sessions: readonly SessionId[]
  list: SessionListStateLike
  collapsed: boolean
  pinned: boolean
  renaming: boolean
  renameDraft: string
  setRenameDraft: (value: string) => void
  commitRename: () => void
  onToggle: () => void
  onMenu: (event: React.MouseEvent) => void
  onBeginRename: () => void
  onTogglePin: () => void
  renderRow: RowRenderer
  t: TFn
}): React.ReactNode {
  const {
    workspace, sessions, list, collapsed, pinned, renaming, renameDraft, setRenameDraft, commitRename,
    onToggle, onMenu, onBeginRename, onTogglePin, renderRow, t,
  } = props
  return (
    <div className={css.workspaceGroup}>
      <WorkspaceHead
        label={workspace.title}
        path={workspace.path}
        sessionCount={sessions.length}
        running={sessions.some(id => list.byId[id]?.running === true)}
        pinned={pinned}
        collapsed={collapsed}
        renaming={renaming}
        renameDraft={renaming ? renameDraft : ''}
        setRenameDraft={setRenameDraft}
        commitRename={commitRename}
        onToggle={onToggle}
        onMenu={onMenu}
        onBeginRename={onBeginRename}
        onTogglePin={onTogglePin}
        t={t}
      />
      {!collapsed && sessions.map(id => renderRow(id, false, workspace.workspaceId))}
    </div>
  )
}

/** 项目组：项目名称行（文件夹图标 + 名称 + 运行标记 + 动作按钮）与组内会话行。 */
export function ProjectGroup(props: {
  project: ProjectView
  sessionRows: React.ReactNode
  workspaceId: string | undefined
  collapsed: boolean
  pinned: boolean
  running: boolean
  onToggle: () => void
  onTogglePin: () => void
  onNewSession: (workspaceId: string) => void
  onMenu: (event: React.MouseEvent, projectId: string) => void
  t: TFn
}): React.ReactNode {
  const {
    project, sessionRows, workspaceId, collapsed, pinned, running,
    onToggle, onTogglePin, onNewSession, onMenu, t,
  } = props
  return (
    <div className={css.workspaceGroup}>
      <div
        className={css.workspaceHead}
        role="treeitem"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={onToggle}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
      >
        {collapsed
          ? <Folder size={13} className={css.workspaceIcon} />
          : <FolderOpen size={13} className={css.workspaceIcon} />}
        <span className={css.workspaceLabel}>{project.name}</span>
        {running && <span aria-hidden="true" className={css.projectRunning} title={t('running')} />}
        {/* 置顶与新建会话共用同一动作容器：悬停或键盘聚焦时显示，
            已置顶项目的动作常驻。 */}
        <span className={pinned ? `${css.workspaceActions} ${css.actionsPinned}` : css.workspaceActions}>
          <button
            type="button"
            className={css.iconButton}
            title={pinned ? t('unpin') : t('pin')}
            aria-label={pinned ? t('unpin') : t('pin')}
            onClick={event => {
              event.stopPropagation()
              onTogglePin()
            }}
          >
            <Pin size={12} {...pinned ? { fill: 'currentColor' } : {}} />
          </button>
          {workspaceId !== undefined && (
            <button
              type="button"
              className={css.iconButton}
              title={t('newSessionInProject')}
              aria-label={t('newSessionInProject')}
              onClick={event => {
                event.stopPropagation()
                onNewSession(workspaceId)
              }}
            >
              <MessageSquarePlus size={12} />
            </button>
          )}
          <button
            type="button"
            className={css.iconButton}
            title={t('moreActions')}
            aria-label={t('moreActions')}
            onClick={event => { onMenu(event, project.projectId) }}
          >
            <MoreHorizontal size={12} />
          </button>
        </span>
      </div>
      {!collapsed && sessionRows}
    </div>
  )
}

/** 搜索结果列表（标题 + 摘要，点击打开会话）。 */
export function SearchResults(props: {
  loading: boolean
  items: readonly SearchResultLike[]
  list: SessionListStateLike
  onOpen: (sessionId: SessionId) => void
  t: TFn
}): React.ReactNode {
  const { loading, items, list, onOpen, t } = props
  if (loading) return <div className={css.empty}>{t('loading')}</div>
  if (items.length === 0) return <div className={css.empty}>{t('filesEmpty')}</div>
  return (
    <>
      {items.map(item => (
        <button type="button" key={item.sessionId} className={css.searchResult} onClick={() => { onOpen(item.sessionId) }}>
          <span className={css.searchResultTitle}>{list.byId[item.sessionId]?.displayTitle ?? item.sessionId}</span>
          <span className={css.searchResultSnippet}>{item.snippet}</span>
        </button>
      ))}
    </>
  )
}

/** 空态：还没有任何会话时的引导。 */
export function EmptyTree(props: { t: TFn }): React.ReactNode {
  return (
    <div className={css.emptyWrap}>
      <Inbox size={22} />
      <span className={css.emptyTitle}>{props.t('sidebarEmptyTitle')}</span>
      <span>{props.t('sidebarEmptyHint')}</span>
    </div>
  )
}
