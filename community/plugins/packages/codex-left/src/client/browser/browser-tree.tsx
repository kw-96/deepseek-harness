/**
 * 侧栏树体：项目分组 / 扁平列表 / 归档与搜索结果。
 * 状态与动作来自 WorkspaceBrowser；分组行的渲染件在 tree-parts。
 */

import type { SessionMetaStore } from '../state/session-meta.js'
import type { BrowserPrefsStore, OrganizeMode, SortMode } from '../state/prefs.js'
import type { GroupsModel } from '../state/groups.js'
import { buildProjectRows } from '../state/tree-model.js'
import type {
  ProjectView, SearchResultLike, SessionId, SessionListStateLike, TFn,
} from '../faces.js'
import { SessionRow } from './parts/session-rows.js'
import {
  BucketGroup, EmptyTree, ProjectGroup, SearchResults, WorkspaceGroup, type RowRenderer,
} from './parts/tree-parts.js'

/** 分组投影结果。 */
export type { GroupsModel } from '../state/groups.js'

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

  const renderRow: RowRenderer = (sessionId, archived = false, workspaceId) => {
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

  if (searching) {
    return <SearchResults loading={searchLoading} items={searchItems} list={list} onOpen={onOpen} t={t} />
  }

  // 项目视图的行模型：项目行 + 只落在未归属项目的工作区里的会话。
  const projectRows = organize === 'byProject' && projects.length > 0
    ? buildProjectRows({ groups, projects, list, meta, prefs, sort })
    : undefined
  const empty = groups.grouped.length === 0 && groups.ungrouped.length === 0 && groups.archived.length === 0

  return (
    <>
      {empty && <EmptyTree t={t} />}
      {organize === 'flat'
        ? groups.flat.map(id => renderRow(id))
        : projectRows !== undefined
          ? <>
            {projectRows.projects.map(row => (
              <ProjectGroup
                key={`project:${row.project.projectId}`}
                project={row.project}
                sessionRows={row.sessionIds.map(id => renderRow(id))}
                workspaceId={row.workspaceId}
                collapsed={collapsed.has(`project:${row.project.projectId}`)}
                pinned={prefs.projectPinned(row.project.projectId)}
                running={row.sessionIds.some(id => list.byId[id]?.running === true)}
                onToggle={() => { onToggleGroup(`project:${row.project.projectId}`) }}
                onTogglePin={() => { onToggleProjectPin(row.project.projectId) }}
                onNewSession={onNewSession}
                onMenu={onProjectMenu}
                t={t}
              />
            ))}
            {projectRows.ungrouped.map(id => renderRow(id))}
          </>
          : groups.grouped.map(({ workspace, sessions }) => (
            <WorkspaceGroup
              key={`ws:${workspace.workspaceId}`}
              workspace={workspace}
              sessions={sessions}
              list={list}
              collapsed={collapsed.has(`ws:${workspace.workspaceId}`)}
              pinned={prefs.workspacePinned(workspace.workspaceId)}
              renaming={renaming === `ws:${workspace.workspaceId}`}
              renameDraft={renameDraft}
              setRenameDraft={setRenameDraft}
              commitRename={() => { commitWorkspaceRename(workspace.workspaceId) }}
              onToggle={() => { onToggleGroup(`ws:${workspace.workspaceId}`) }}
              onMenu={event => { onWorkspaceMenu(event, workspace.workspaceId) }}
              onBeginRename={() => { onBeginWorkspaceRename(workspace.workspaceId, workspace.title) }}
              onTogglePin={() => { onToggleWorkspacePin(workspace.workspaceId) }}
              renderRow={renderRow}
              t={t}
            />
          ))}
      {organize === 'byProject' && groups.ungrouped.length > 0 && <BucketGroup
        label={t('ungrouped')}
        rows={groups.ungrouped}
        collapsed={collapsed.has('ungrouped')}
        onToggle={() => { onToggleGroup('ungrouped') }}
        renderRow={renderRow}
      />}
      {groups.archived.length > 0 && <BucketGroup
        label={t('archived')}
        rows={groups.archived}
        collapsed={collapsed.has('archived')}
        archived
        onToggle={() => { onToggleGroup('archived') }}
        renderRow={renderRow}
      />}
    </>
  )
}
