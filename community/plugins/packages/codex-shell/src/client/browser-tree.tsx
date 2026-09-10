/**
 * 侧栏树体：项目分组 / 扁平列表 / 归档与搜索结果。
 * 状态与动作来自 WorkspaceBrowser。
 */

import { Archive, Folder, FolderOpen, Inbox, Pin } from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import type { BrowserPrefsStore, OrganizeMode, SortMode } from './sidebar/prefs.js'
import { orderProjects, sortSessionIds, type GroupsModel } from './sidebar/groups.js'
import type { ProjectView, SearchResultLike, SessionId, SessionListStateLike, TFn, WorkspaceViewLike } from './faces.js'
import { SessionRow } from './session-rows.js'
import { WorkspaceHead } from './workspace-head.js'
import css from './styles.module.css'

/** 分组投影结果。 */
export type { GroupsModel } from './sidebar/groups.js'

export interface BrowserTreeProps {
  groups: GroupsModel
  list: SessionListStateLike
  collapsed: ReadonlySet<string>
  searching: boolean
  searchItems: readonly SearchResultLike[]
  searchLoading: boolean
  renaming: string | null
  renameDraft: string
  organize: OrganizeMode
  sort: SortMode
  prefs: BrowserPrefsStore
  projects: readonly ProjectView[]
  onToggleGroup: (key: string) => void
  onOpen: (sessionId: SessionId) => void
  onWorkspaceMenu: (event: React.MouseEvent, workspaceId: string) => void
  onSessionMenu: (event: React.MouseEvent, sessionId: SessionId) => void
  onArchiveSession: (sessionId: SessionId) => void
  onToggleWorkspacePin: (workspaceId: string) => void
  onToggleProjectPin: (projectId: string) => void
  onBeginWorkspaceRename: (workspaceId: string, title: string) => void
  setRenameDraft: (value: string) => void
  commitRename: (sessionId: SessionId) => void
  commitWorkspaceRename: (workspaceId: string) => void
  onSessionDrop: (
    sessionId: SessionId,
    beforeSessionId: SessionId | undefined,
    workspaceId: string,
    fromWorkspaceId?: string,
  ) => void
  sessionWorkspaceId: (sessionId: SessionId) => string | undefined
  meta: SessionMetaStore
  t: TFn
}

/** Normalize a directory path for longest-prefix matching, case-folding on Windows. */
function projectKey(value: string): string {
  return value.replace(/\//g, '\\').replace(/\\+$/u, '').toLowerCase()
}

/** Resolve the project owning one workspace path by longest root prefix. */
function projectForPath(path: string, projects: readonly ProjectView[]): ProjectView | undefined {
  const key = projectKey(path)
  let best: ProjectView | undefined
  let bestLength = 0
  for (const project of projects) {
    for (const root of project.roots) {
      const rootKey = projectKey(root)
      if (rootKey === '' || (key !== rootKey && !key.startsWith(rootKey + '\\'))) continue
      if (rootKey.length < bestLength) continue
      best = project
      bestLength = rootKey.length
    }
  }
  return best
}

/** 渲染树体。 */
export function BrowserTree(props: BrowserTreeProps): React.ReactNode {
  const {
    groups, list, collapsed, searching, searchItems, searchLoading,
    renaming, renameDraft, organize, sort, prefs, projects, onToggleGroup, onOpen, onWorkspaceMenu,
    onSessionMenu, onArchiveSession, onToggleWorkspacePin, onToggleProjectPin, onBeginWorkspaceRename,
    setRenameDraft, commitRename, commitWorkspaceRename, onSessionDrop,
    sessionWorkspaceId, meta, t,
  } = props
  const manual = sort === 'manual'

  const sessionRow = (sessionId: SessionId, archived = false, workspaceId?: string) => {
    const summary = list.byId[sessionId]
    if (summary === undefined) return null
    const wsId = workspaceId ?? sessionWorkspaceId(sessionId)
    return <SessionRow
      key={sessionId}
      sessionId={sessionId}
      title={summary.displayTitle}
      cwd={summary.cwd}
      current={list.current === sessionId}
      running={summary.running}
      archived={archived}
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
        const fromWorkspaceId = event.dataTransfer.getData('text/workspace-id')
        onSessionDrop(dragged, sessionId, wsId, fromWorkspaceId === '' ? undefined : fromWorkspaceId)
      }}
      meta={meta}
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
        <button type="button" className={css.workspaceHead} role="treeitem" aria-expanded={!isCollapsed}
          onClick={() => { onToggleGroup(key) }}>
          <Archive size={13} className={css.workspaceIcon} />
          <span className={css.workspaceLabel}>{label}</span>
        </button>
        {!isCollapsed && rows.map(id => sessionRow(id, archived))}
      </div>
    )
  }

  const renderProject = (project: ProjectView, sessionRows: React.ReactNode[]): React.ReactNode => {
    const key = `project:${project.projectId}`
    const isCollapsed = collapsed.has(key)
    const pinned = prefs.projectPinned(project.projectId)
    return (
      <div key={key} className={css.workspaceGroup}>
        <div
          className={css.workspaceHead}
          role="treeitem"
          tabIndex={0}
          aria-expanded={!isCollapsed}
          onClick={() => { onToggleGroup(key) }}
          onKeyDown={event => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onToggleGroup(key)
            }
          }}
        >
          {isCollapsed
            ? <Folder size={13} className={css.workspaceIcon} />
            : <FolderOpen size={13} className={css.workspaceIcon} />}
          <span className={css.workspaceLabel}>{project.name}</span>
          {pinned
            ? (
              <button
                type="button"
                className={css.iconButton}
                title={t('unpin')}
                aria-label={t('unpin')}
                onClick={event => {
                  event.stopPropagation()
                  onToggleProjectPin(project.projectId)
                }}
              >
                <Pin size={12} fill="currentColor" />
              </button>
            )
            : (
              <span className={css.workspaceActions}>
                <button
                  type="button"
                  className={css.iconButton}
                  title={t('pin')}
                  aria-label={t('pin')}
                  onClick={event => {
                    event.stopPropagation()
                    onToggleProjectPin(project.projectId)
                  }}
                >
                  <Pin size={12} />
                </button>
              </span>
            )}
        </div>
        {!isCollapsed && sessionRows}
      </div>
    )
  }

  const renderByProject = (): React.ReactNode => {
    const byProject = new Map<string, SessionId[]>()
    const ungrouped: SessionId[] = []
    for (const { workspace, sessions } of groups.grouped) {
      const project = projectForPath(workspace.path, projects)
      if (project === undefined) {
        ungrouped.push(...sessions)
        continue
      }
      const list = byProject.get(project.projectId)
      if (list === undefined) byProject.set(project.projectId, [...sessions])
      else list.push(...sessions)
    }
    // 项目内会话可能来自多个工作区，合并后按当前排序模式整体重排：
    // 置顶优先时置顶先于其余（置顶之间按最近更新），余下按最近更新。
    const sortList = (ids: readonly SessionId[]): SessionId[] =>
      sortSessionIds(ids, list, meta, sort)
    // 项目组本身按同一套逻辑排列：置顶 → 最近更新 → 其余（注册表顺序兜底）。
    const ordered = orderProjects(projects, prefs, sort)
    return (
      <>
        {ordered.map(project => renderProject(project, sortList(byProject.get(project.projectId) ?? []).map(id => sessionRow(id))))}
        {sortList(ungrouped).map(id => sessionRow(id))}
      </>
    )
  }

  if (searching) {
    return (
      <>
        {searchLoading
          ? <div className={css.empty}>{t('loading')}</div>
          : searchItems.length === 0
            ? <div className={css.empty}>{t('filesEmpty')}</div>
            : searchItems.map(item => (
              <button type="button" key={item.sessionId} className={css.searchResult} onClick={() => { onOpen(item.sessionId) }}>
                <span className={css.searchResultTitle}>{list.byId[item.sessionId]?.displayTitle ?? item.sessionId}</span>
                <span className={css.searchResultSnippet}>{item.snippet}</span>
              </button>
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
        : projects.length > 0
          ? renderByProject()
          : groups.grouped.map(({ workspace, sessions }) => renderWorkspace(workspace, sessions))}
      {organize === 'byProject' && groups.ungrouped.length > 0
        && renderBucket('ungrouped', t('ungrouped'), groups.ungrouped)}
      {groups.archived.length > 0 && renderBucket('archived', t('archived'), groups.archived, true)}
    </>
  )
}
