/**
 * 侧栏树体：项目分组 / 扁平列表 / 归档与搜索结果。
 * 状态与动作来自 WorkspaceBrowser。
 */

import { Archive, Inbox } from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import type { BrowserPrefsStore, OrganizeMode, SortMode } from './sidebar/prefs.js'
import type { SearchResultLike, SessionId, SessionListStateLike, TFn, WorkspaceViewLike } from './faces.js'
import { SessionRow } from './session-rows.js'
import { WorkspaceHead } from './workspace-head.js'
import css from './styles.module.css'

/** 分组投影结果。 */
export interface GroupsModel {
  grouped: { workspace: WorkspaceViewLike; sessions: SessionId[] }[]
  ungrouped: SessionId[]
  archived: SessionId[]
  flat: SessionId[]
}

export interface BrowserTreeProps {
  groups: GroupsModel
  list: SessionListStateLike
  collapsed: ReadonlySet<string>
  collapsedSubagents: ReadonlySet<string>
  searching: boolean
  searchItems: readonly SearchResultLike[]
  searchLoading: boolean
  renaming: string | null
  renameDraft: string
  organize: OrganizeMode
  sort: SortMode
  prefs: BrowserPrefsStore
  onToggleGroup: (key: string) => void
  onOpen: (sessionId: SessionId) => void
  onWorkspaceMenu: (event: React.MouseEvent, workspaceId: string) => void
  onSessionMenu: (event: React.MouseEvent, sessionId: SessionId) => void
  onArchiveSession: (sessionId: SessionId) => void
  onToggleWorkspacePin: (workspaceId: string) => void
  onBeginWorkspaceRename: (workspaceId: string, title: string) => void
  onToggleSubagents: (key: string) => void
  setRenameDraft: (value: string) => void
  commitRename: (sessionId: SessionId) => void
  commitWorkspaceRename: (workspaceId: string) => void
  onSessionDrop: (sessionId: SessionId, beforeSessionId: SessionId | undefined, workspaceId: string) => void
  sessionWorkspaceId: (sessionId: SessionId) => string | undefined
  meta: SessionMetaStore
  t: TFn
}

/** 渲染树体。 */
export function BrowserTree(props: BrowserTreeProps): React.ReactNode {
  const {
    groups, list, collapsed, collapsedSubagents, searching, searchItems, searchLoading,
    renaming, renameDraft, organize, sort, prefs, onToggleGroup, onOpen, onWorkspaceMenu,
    onSessionMenu, onArchiveSession, onToggleWorkspacePin, onBeginWorkspaceRename,
    onToggleSubagents, setRenameDraft, commitRename, commitWorkspaceRename, onSessionDrop,
    sessionWorkspaceId, meta, t,
  } = props
  const now = Date.now()
  const manual = sort === 'manual'

  const timeLabelFor = (updatedAt: number): string => {
    const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000))
    if (seconds < 60) return t('timeNow')
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return t('timeMinAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('timeHourAgo', { n: hours })
    const days = Math.floor(hours / 24)
    if (days < 7) return t('timeDayAgo', { n: days })
    return new Date(updatedAt).toLocaleDateString()
  }

  const sessionRow = (sessionId: SessionId, archived = false, workspaceId?: string) => {
    const summary = list.byId[sessionId]
    if (summary === undefined) return null
    const subagents = list.ids.flatMap(id => {
      const child = list.byId[id]
      if (child === undefined || child.parentId !== sessionId || child.origin !== 'subagent' || child.blank) return []
      return [{ id, title: child.displayTitle, current: list.current === id, running: child.running }]
    })
    const wsId = workspaceId ?? sessionWorkspaceId(sessionId)
    return <SessionRow
      key={sessionId}
      sessionId={sessionId}
      title={summary.displayTitle}
      timeLabel={timeLabelFor(summary.updatedAt)}
      cwd={summary.cwd}
      current={list.current === sessionId}
      running={summary.running}
      archived={archived}
      subagents={subagents}
      expanded={!collapsedSubagents.has(`sub:${sessionId}`)}
      onToggleSubagents={() => { onToggleSubagents(`sub:${sessionId}`) }}
      renaming={renaming === sessionId}
      renameDraft={renaming === sessionId ? renameDraft : ''}
      setRenameDraft={setRenameDraft}
      commitRename={() => { commitRename(sessionId) }}
      onOpen={() => { onOpen(sessionId) }}
      onMenu={event => { onSessionMenu(event, sessionId) }}
      onArchive={() => { onArchiveSession(sessionId) }}
      draggable={manual && !archived && wsId !== undefined}
      onDragStart={event => {
        event.dataTransfer.setData('text/session-id', sessionId)
        if (wsId !== undefined) event.dataTransfer.setData('text/workspace-id', wsId)
      }}
      onDragOver={event => {
        if (!manual || archived) return
        event.preventDefault()
      }}
      onDrop={event => {
        if (!manual || archived || wsId === undefined) return
        event.preventDefault()
        const dragged = event.dataTransfer.getData('text/session-id') as SessionId
        if (dragged === '' || dragged === sessionId) return
        onSessionDrop(dragged, sessionId, wsId)
      }}
      meta={meta}
      open={onOpen}
      t={t}
    />
  }

  const renderWorkspace = (workspace: WorkspaceViewLike, sessions: SessionId[]): React.ReactNode => {
    const key = `ws:${workspace.workspaceId}`
    const isCollapsed = collapsed.has(key)
    return (
      <div key={key} className={css.workspaceGroup}>
        <WorkspaceHead
          label={workspace.title}
          path={workspace.path}
          sessionCount={sessions.length}
          pinned={prefs.workspacePinned(workspace.workspaceId)}
          collapsed={isCollapsed}
          renaming={renaming === `ws:${workspace.workspaceId}`}
          renameDraft={renaming === `ws:${workspace.workspaceId}` ? renameDraft : ''}
          setRenameDraft={setRenameDraft}
          commitRename={() => { commitWorkspaceRename(workspace.workspaceId) }}
          onToggle={() => { onToggleGroup(key) }}
          onMenu={event => { onWorkspaceMenu(event, workspace.workspaceId) }}
          onBeginRename={() => { onBeginWorkspaceRename(workspace.workspaceId, workspace.title) }}
          onTogglePin={() => { onToggleWorkspacePin(workspace.workspaceId) }}
          t={t}
        />
        {!isCollapsed && sessions.map(id => sessionRow(id, false, workspace.workspaceId))}
      </div>
    )
  }

  const renderBucket = (key: string, label: string, rows: SessionId[], archived = false): React.ReactNode => {
    const isCollapsed = collapsed.has(key)
    return (
      <div key={key} className={css.workspaceGroup}>
        <div className={css.workspaceHead} role="treeitem" aria-expanded={!isCollapsed}
          onClick={() => { onToggleGroup(key) }}>
          <Archive size={13} className={css.workspaceIcon} />
          <span className={css.workspaceLabel}>{label}</span>
        </div>
        {!isCollapsed && rows.map(id => sessionRow(id, archived))}
      </div>
    )
  }

  if (searching) {
    return (
      <>
        {searchLoading
          ? <div className={css.empty}>{t('pluginLoading')}</div>
          : searchItems.length === 0
            ? <div className={css.empty}>{t('filesEmpty')}</div>
            : searchItems.map(item => (
              <div key={item.sessionId} className={css.searchResult} onClick={() => { onOpen(item.sessionId) }}>
                <span className={css.searchResultTitle}>{list.byId[item.sessionId]?.displayTitle ?? item.sessionId}</span>
                <span className={css.searchResultSnippet}>{item.snippet}</span>
              </div>
            ))}
      </>
    )
  }

  const empty = groups.grouped.length === 0 && groups.ungrouped.length === 0 && groups.archived.length === 0
  return (
    <>
      {empty && (
        <div className={css.emptyWrap}>
          <Inbox size={22} />
          <span className={css.emptyTitle}>{t('sidebarEmptyTitle')}</span>
          <span>{t('sidebarEmptyHint')}</span>
        </div>
      )}
      {organize === 'flat'
        ? groups.flat.map(id => sessionRow(id))
        : groups.grouped.map(({ workspace, sessions }) => renderWorkspace(workspace, sessions))}
      {organize === 'byProject' && groups.ungrouped.length > 0
        && renderBucket('ungrouped', t('ungrouped'), groups.ungrouped)}
      {groups.archived.length > 0 && renderBucket('archived', t('archived'), groups.archived, true)}
    </>
  )
}
