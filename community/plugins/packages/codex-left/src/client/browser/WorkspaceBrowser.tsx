/**
 * 侧栏工作区/会话浏览器：Codex 式搜索、项目标题栏、分组树与浮层装配。
 * 契约在 browser-types，动作在 actions/project-actions，副作用与重命名状态在
 * use-browser-effects，外壳在 chrome，分组渲染件在 parts/tree-parts。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { buildGroupsModel, projectForPath } from '../state/groups.js'
import { useBrowserPrefs } from '../state/prefs.js'
import { useSessionSearch } from '../state/use-session-search.js'
import { requestAddWorkspaceOpen } from '../state/add-workspace-bus.js'
import type { ProjectView, SessionId } from '../faces.js'
import type { CodexBrowserProps } from './browser-types.js'
import { buildActionDeps, buildSessionActions, buildWorkspaceActions } from './actions.js'
import { buildProjectActions, sessionWorkspaceId } from './project-actions.js'
import { useAutoArchive, useCollapsedGroups, useFocusSearchOnExpand, useRename } from './use-browser-effects.js'
import { BrowserRailControls, BrowserSearchBar } from './chrome.js'
import { BrowserTree } from './browser-tree.js'
import { BrowserOverlays } from './browser-overlays.js'
import { SectionHeader } from './parts/section-header.js'
import type { BrowserMenuState, BrowserMenuTarget } from '../overlays/browser-menu.js'
import css from '../styles.module.css'

export type { CodexBrowserInjected, CodexBrowserProps } from './browser-types.js'

/** Codex 侧栏浏览器根组件。 */
export function CodexBrowser(props: CodexBrowserProps) {
  const { wide, expandSidebar, useSessions, useWorkspaces, meta, prefs, t } = props
  const list = useSessions(state => state)
  const workspaces = useWorkspaces(state => state.items)
  const archivedIds = useWorkspaces(state => state.archivedSessionIds)
  const [menu, setMenu] = useState<BrowserMenuState | null>(null)
  const { search, setQuery, clear: clearSearch } = useSessionSearch(props.searchSessions)
  const [searchOnExpand, setSearchOnExpand] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const { collapsed, toggle: toggleGroup } = useCollapsedGroups(prefs)
  const [prefsSnap, setPrefs] = useBrowserPrefs(prefs)
  const [rev, bump] = useState(0)
  const [projects, setProjects] = useState<readonly ProjectView[]>([])
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [worktreeProjectId, setWorktreeProjectId] = useState<string | null>(null)

  const refreshProjects = async (): Promise<void> => {
    try {
      setProjects((await props.listProjects()).projects)
    } catch {
      // 项目读取失败时保留当前列表
    }
  }

  useEffect(() => {
    void refreshProjects()
  }, [])

  useAutoArchive({
    list, archivedIds, days: prefsSnap.autoArchiveDays, archiveSession: props.archiveSession,
  })
  useFocusSearchOnExpand({
    wide, pending: searchOnExpand, inputRef: searchInput, onDone: () => { setSearchOnExpand(false) },
  })

  const rename = useRename({
    renameSession: props.renameSession,
    renameWorkspace: props.renameWorkspace,
    closeMenu: () => { setMenu(null) },
  })

  const groups = useMemo(() => buildGroupsModel({
    list, workspaces, archivedIds, meta, prefs,
    organize: prefsSnap.organize, sort: prefsSnap.sort,
  }), [workspaces, archivedIds, list, meta, prefs, prefsSnap.organize, prefsSnap.sort, rev])

  const actions = buildActionDeps({
    props,
    list,
    workspaces,
    projects,
    rename,
    closeMenu: () => { setMenu(null) },
    bump: () => { bump(n => n + 1) },
    refreshProjects,
    setWorktreeProjectId,
  })

  const workspaceOfSession = (sessionId: SessionId): string | undefined =>
    sessionWorkspaceId(workspaces, sessionId)
  /** 会话所属项目：由所属工作区的目录路径按项目 roots 前缀解析。 */
  const sessionProjectId = (sessionId: SessionId): string | undefined => {
    const workspace = workspaces.find(ws => ws.workspaceId === workspaceOfSession(sessionId))
    if (workspace === undefined) return undefined
    return projectForPath(workspace.path, projects)?.projectId
  }
  const openMenu = (event: React.MouseEvent, target: BrowserMenuTarget): void => {
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, ...target })
  }

  return (
    <div className={wide ? css.root : `${css.root} ${css.rail}`}>
      <BrowserSearchBar
        query={search.query}
        inputRef={searchInput}
        onQuery={setQuery}
        onClear={clearSearch}
        t={t}
      />
      {!wide && (
        <BrowserRailControls
          onExpand={() => { setSearchOnExpand(true); expandSidebar() }}
          t={t}
        />
      )}
      {wide && (
        <SectionHeader
          organize={prefsSnap.organize}
          sort={prefsSnap.sort}
          autoArchiveDays={prefsSnap.autoArchiveDays}
          onOrganize={mode => { setPrefs({ organize: mode }); bump(n => n + 1) }}
          onSort={mode => { setPrefs({ sort: mode }); bump(n => n + 1) }}
          onAutoArchive={days => { setPrefs({ autoArchiveDays: days }); bump(n => n + 1) }}
          onAddWorkspace={requestAddWorkspaceOpen}
          onNewProject={() => { setCreateProjectOpen(true) }}
          t={t}
        />
      )}
      <div className={css.treeBody} role="tree" aria-label={t('sidebarTitle')}>
        <BrowserTree
          groups={groups}
          list={list}
          collapsed={collapsed}
          searching={search.query !== ''}
          searchItems={search.items}
          searchLoading={search.loading}
          renaming={rename.renaming}
          renameDraft={rename.renameDraft}
          organize={prefsSnap.organize}
          sort={prefsSnap.sort}
          prefs={prefs}
          projects={projects}
          onToggleGroup={toggleGroup}
          onOpen={props.open}
          onWorkspaceMenu={(event, workspaceId) => { openMenu(event, { kind: 'workspace', workspaceId }) }}
          onSessionMenu={(event, sessionId) => { openMenu(event, { kind: 'session', sessionId }) }}
          onProjectMenu={(event, projectId) => { openMenu(event, { kind: 'project', projectId }) }}
          onArchiveSession={sessionId => { void props.archiveSession(sessionId) }}
          onRestoreSession={sessionId => { void props.unarchiveSession(sessionId) }}
          onToggleWorkspacePin={workspaceId => {
            prefs.setWorkspacePinned(workspaceId, !prefs.workspacePinned(workspaceId))
            bump(n => n + 1)
          }}
          onToggleProjectPin={projectId => {
            prefs.setProjectPinned(projectId, !prefs.projectPinned(projectId))
            bump(n => n + 1)
          }}
          onNewSession={workspaceId => { props.startSession(workspaceId) }}
          onBeginWorkspaceRename={rename.beginWorkspace}
          setRenameDraft={rename.setRenameDraft}
          commitRename={sessionId => { rename.commitSession(sessionId) }}
          commitWorkspaceRename={workspaceId => { rename.commitWorkspace(workspaceId) }}
          onSessionDrop={(sessionId, beforeSessionId, workspaceId, fromWorkspaceId) => {
            if (fromWorkspaceId !== undefined && fromWorkspaceId !== workspaceId) {
              void props.moveSession(workspaceId, sessionId)
            } else {
              void props.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
            }
          }}
          sessionWorkspaceId={workspaceOfSession}
          meta={meta}
          t={t}
        />
      </div>
      <BrowserOverlays
        menu={menu}
        onDismissMenu={() => { setMenu(null) }}
        sessionActions={sessionId => buildSessionActions(actions, sessionId)}
        workspaceActions={workspaceId => buildWorkspaceActions(actions, workspaceId)}
        projectActions={projectId => buildProjectActions(actions, projectId)}
        projects={projects}
        sessionProjectId={sessionProjectId}
        sessionCwd={sessionId => list.byId[sessionId]?.cwd}
        projectName={projectId => projects.find(item => item.projectId === projectId)?.name ?? ''}
        createProjectOpen={createProjectOpen}
        onCloseCreateProject={() => { setCreateProjectOpen(false) }}
        worktreeProject={projects.find(item => item.projectId === worktreeProjectId) ?? null}
        onCloseWorktrees={() => { setWorktreeProjectId(null) }}
        workspaces={workspaces}
        fsList={props.fsList}
        createWorkspace={props.createWorkspace}
        createProject={props.createProject}
        onProjectsChanged={refreshProjects}
        setProjectRoots={props.setProjectRoots}
        t={t}
      />
    </div>
  )
}
