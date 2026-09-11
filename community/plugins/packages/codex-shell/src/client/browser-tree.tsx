/**
 * 侧栏树体：项目分组 / 扁平列表 / 归档与搜索结果。
 * 状态与动作来自 WorkspaceBrowser。
 */

import { Archive, Folder, FolderOpen, Inbox, MessageSquarePlus, MoreHorizontal, Pin } from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import type { BrowserPrefsStore, OrganizeMode, SortMode } from './sidebar/prefs.js'
import { orderProjects, projectForPath, sortSessionIds, type GroupsModel } from './sidebar/groups.js'
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
  /** 取消归档：把归档桶里的会话恢复到分组面。 */
  onRestoreSession: (sessionId: SessionId) => void
  onToggleWorkspacePin: (workspaceId: string) => void
  onToggleProjectPin: (projectId: string) => void
  /** 打开项目「更多」菜单（重命名/管理工作树/归档组内/删除）。 */
  onProjectMenu: (event: React.MouseEvent, projectId: string) => void
  /** 在项目所属工作区中新建会话。 */
  onNewSession: (workspaceId: string) => void
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

/** 渲染树体。 */
export function BrowserTree(props: BrowserTreeProps): React.ReactNode {
  const {
    groups, list, collapsed, searching, searchItems, searchLoading,
    renaming, renameDraft, organize, sort, prefs, projects, onToggleGroup, onOpen, onWorkspaceMenu,
    onSessionMenu, onArchiveSession, onRestoreSession, onToggleWorkspacePin, onToggleProjectPin, onProjectMenu, onNewSession,
    onBeginWorkspaceRename, setRenameDraft, commitRename, commitWorkspaceRename, onSessionDrop,
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
      onRestore={archived ? () => { onRestoreSession(sessionId) } : undefined}
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
          running={sessions.some(id => list.byId[id]?.running === true)}
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

  const renderProject = (
    project: ProjectView,
    sessionIds: readonly SessionId[],
    sessionRows: React.ReactNode[],
    workspaceId: string | undefined,
  ): React.ReactNode => {
    const key = `project:${project.projectId}`
    const isCollapsed = collapsed.has(key)
    const pinned = prefs.projectPinned(project.projectId)
    // 项目名称行的进行中标记：组内任一会话在跑就点亮，收起时同样可见。
    const running = sessionIds.some(id => list.byId[id]?.running === true)
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
                onToggleProjectPin(project.projectId)
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
              onClick={event => { onProjectMenu(event, project.projectId) }}
            >
              <MoreHorizontal size={12} />
            </button>
          </span>
        </div>
        {!isCollapsed && sessionRows}
      </div>
    )
  }

  const renderByProject = (): React.ReactNode => {
    const byProject = new Map<string, SessionId[]>()
    // 项目 → 首个归属工作区：新建会话按钮在该工作区中开会话。
    const workspaceByProject = new Map<string, string>()
    const ungrouped: SessionId[] = []
    for (const { workspace, sessions } of groups.grouped) {
      const project = projectForPath(workspace.path, projects)
      if (project === undefined) {
        ungrouped.push(...sessions)
        continue
      }
      if (!workspaceByProject.has(project.projectId)) {
        workspaceByProject.set(project.projectId, workspace.workspaceId)
      }
      const list = byProject.get(project.projectId)
      if (list === undefined) byProject.set(project.projectId, [...sessions])
      else list.push(...sessions)
    }
    // 项目内会话可能来自多个工作区，合并后按当前排序模式整体重排：
    // 置顶优先时置顶先于其余（置顶之间按最近更新），余下按最近更新。
    const sortList = (ids: readonly SessionId[]): SessionId[] =>
      sortSessionIds(ids, list, meta, sort)
    // 项目组恒按 置顶 → 最近活动 排列：最近活动取项目下会话的最大 updatedAt，
    // 无会话的项目回退到注册表 updatedAt（在 orderProjects 内兜底）。
    const recency = (projectId: string): number => {
      let latest = 0
      for (const id of byProject.get(projectId) ?? []) {
        const updatedAt = list.byId[id]?.updatedAt ?? 0
        if (updatedAt > latest) latest = updatedAt
      }
      return latest
    }
    const ordered = orderProjects(projects, prefs, recency)
    return (
      <>
        {ordered.map(project => {
          const ids = sortList(byProject.get(project.projectId) ?? [])
          return renderProject(
            project,
            ids,
            ids.map(id => sessionRow(id)),
            workspaceByProject.get(project.projectId),
          )
        })}
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
