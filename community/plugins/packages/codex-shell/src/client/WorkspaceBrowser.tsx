/**
 * 侧栏工作区/会话浏览器：Codex 式搜索、项目标题栏、分组树与嵌套菜单。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { FsListResponse } from 'dsh-codex-shell/types'
import type { SessionMetaStore } from './session-meta.js'
import { BrowserMenu, type BrowserMenuState, type BrowserMenuTarget } from './browser-menu.js'
import { BrowserTree } from './browser-tree.js'
import { SectionHeader } from './sidebar/section-header.js'
import { buildGroupsModel, pathKey, projectForPath } from './sidebar/groups.js'
import { useBrowserPrefs, type BrowserPrefsStore } from './sidebar/prefs.js'
import { requestAddWorkspaceOpen } from './sidebar/add-workspace-bus.js'
import { useSessionSearch } from './sidebar/search/use-session-search.js'
import { ProjectCreateModal } from './sidebar/project/create-modal.js'
import { ProjectWorktreesModal } from './sidebar/project/worktrees-modal.js'
import type { ProjectMenuActions } from './sidebar/project/menu.js'
import type { SessionMenuActions } from './sidebar/session-menu.js'
import type { WorkspaceMenuActions } from './sidebar/workspace-menu.js'
import type {
  ProjectView, SearchResultLike, SelectorHook, SessionId, SessionListStateLike,
  TFn, WorkspaceSnapshotLike,
} from './faces.js'
import css from './styles.module.css'

const EXPAND_SLIDE_MS = 300
/** 自动归档扫描间隔（30 分钟）：只在浏览器打开时运行，幂等且按已归档集合跳过。 */
const AUTO_ARCHIVE_SWEEP_MS = 30 * 60 * 1000

/** 注入共享面。 */
export interface CodexBrowserInjected {
  startSession: (workspaceId?: string) => void
  open: (sessionId: SessionId) => void
  searchSessions: (query: string, signal: AbortSignal) => Promise<{ items: readonly SearchResultLike[]; hasMore: boolean }>
  searchResultLimit: number
  renameSession: (sessionId: SessionId, title: string) => Promise<void>
  forkSession: (sessionId: SessionId) => void
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
  deleteWorkspace: (workspaceId: string) => Promise<void>
  /** 以目录路径创建或复用工作区（幂等），用于项目归并时补建工作树。 */
  createWorkspace: (input: { path: string }) => Promise<{ workspaceId: string, path: string }>
  insertWorkspaceBefore: (workspaceId: string, beforeWorkspaceId?: string) => Promise<void>
  archiveSession: (sessionId: SessionId) => Promise<void>
  /** 取消归档：把归档会话恢复到分组面。 */
  unarchiveSession: (sessionId: SessionId) => Promise<void>
  insertSessionBefore: (workspaceId: string, sessionId: SessionId, beforeSessionId?: SessionId) => Promise<void>
  attachSession: (workspaceId: string, sessionId: SessionId) => Promise<void>
  moveSession: (workspaceId: string, sessionId: SessionId) => Promise<void>
  detachSession: (workspaceId: string, sessionId: SessionId) => Promise<void>
  listProjects: () => Promise<{ projects: readonly ProjectView[] }>
  createProject: (name: string, roots?: readonly string[]) => Promise<{ project: ProjectView }>
  renameProject: (projectId: string, name: string) => Promise<{ project: ProjectView }>
  setProjectRoots: (projectId: string, roots: readonly string[]) => Promise<{ project: ProjectView }>
  deleteProject: (projectId: string) => Promise<{ deleted: boolean }>
  openWorkspacePath: (path: string) => Promise<void>
  openTerminalForSession: (sessionId: SessionId, cwd?: string) => Promise<void>
  exportSessionMarkdown: (sessionId: SessionId) => Promise<string | null>
  canExportMarkdown: boolean
  /** 目录列举（新建项目/管理工作树的目录浏览）。 */
  fsList: (path: string) => Promise<FsListResponse>
  meta: SessionMetaStore
  prefs: BrowserPrefsStore
}

export interface CodexBrowserProps extends CodexBrowserInjected {
  wide: boolean
  expandSidebar: () => void
  useSessions: SelectorHook<SessionListStateLike>
  useWorkspaces: SelectorHook<WorkspaceSnapshotLike>
  t: TFn
}

function deepLink(sessionId: SessionId): string {
  return `?session=${sessionId}`
}

async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text) } catch { /* 剪贴板不可用时跳过 */ }
}

/** Codex 侧栏浏览器根组件。 */
export function CodexBrowser(props: CodexBrowserProps) {
  const {
    wide, expandSidebar, useSessions, useWorkspaces, startSession, open, searchSessions,
    renameSession, forkSession, renameWorkspace, deleteWorkspace, createWorkspace, archiveSession,
    unarchiveSession,
    insertSessionBefore, moveSession, detachSession, openWorkspacePath, openTerminalForSession,
    exportSessionMarkdown, canExportMarkdown, fsList, meta, prefs, t,
    listProjects, createProject, renameProject, setProjectRoots, deleteProject,
  } = props
  const list = useSessions(state => state)
  const workspaces = useWorkspaces(state => state.items)
  const archivedIds = useWorkspaces(state => state.archivedSessionIds)
  const [menu, setMenu] = useState<BrowserMenuState | null>(null)
  const { search, setQuery, clear: clearSearch } = useSessionSearch(searchSessions)
  const [searchOnExpand, setSearchOnExpand] = useState(false)
  const searchInput = useRef<HTMLInputElement | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => prefs.collapsedGroups())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [prefsSnap, setPrefs] = useBrowserPrefs(prefs)
  const [rev, bump] = useState(0)
  const [projects, setProjects] = useState<readonly ProjectView[]>([])
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [worktreeProjectId, setWorktreeProjectId] = useState<string | null>(null)

  const refreshProjects = async (): Promise<void> => {
    try {
      setProjects((await listProjects()).projects)
    } catch {
      // 项目读取失败时保留当前列表
    }
  }

  useEffect(() => {
    void refreshProjects()
  }, [])

  // 自动归档：会话超过阈值天数无活动即归档。运行中、当前选中、空白占位、
  // 子代理会话与已归档项都不动；阈值 0 表示关闭。
  const sweepState = useRef({ list, archivedIds, days: prefsSnap.autoArchiveDays, current: list.current })
  sweepState.current = {
    list, archivedIds, days: prefsSnap.autoArchiveDays, current: list.current,
  }
  useEffect(() => {
    const sweep = (): void => {
      const { list: snapshot, archivedIds: archived, days, current } = sweepState.current
      if (days <= 0) return
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      for (const id of snapshot.ids) {
        const summary = snapshot.byId[id]
        if (summary === undefined || summary.blank || summary.running) continue
        if (summary.origin === 'subagent' || summary.cwd === undefined) continue
        if (id === current || archived.includes(id)) continue
        if (summary.updatedAt >= cutoff) continue
        void archiveSession(id)
      }
    }
    sweep()
    const timer = window.setInterval(sweep, AUTO_ARCHIVE_SWEEP_MS)
    return () => { window.clearInterval(timer) }
  }, [archiveSession])

  useEffect(() => {
    if (!(wide && searchOnExpand)) return
    const timer = window.setTimeout(() => {
      searchInput.current?.focus({ preventScroll: true })
      setSearchOnExpand(false)
    }, EXPAND_SLIDE_MS)
    return () => { window.clearTimeout(timer) }
  }, [wide, searchOnExpand])

  const groups = useMemo(() => buildGroupsModel({
    list, workspaces, archivedIds, meta, prefs,
    organize: prefsSnap.organize, sort: prefsSnap.sort,
  }), [workspaces, archivedIds, list, meta, prefs, prefsSnap.organize, prefsSnap.sort, rev])

  const sessionWorkspaceId = (sessionId: SessionId): string | undefined =>
    workspaces.find(ws => ws.sessionIds.includes(sessionId))?.workspaceId

  /** 会话所属项目：由所属工作区的目录路径按项目 roots 前缀解析。 */
  const sessionProjectId = (sessionId: SessionId): string | undefined => {
    const workspaceId = sessionWorkspaceId(sessionId)
    const workspace = workspaces.find(ws => ws.workspaceId === workspaceId)
    if (workspace === undefined) return undefined
    return projectForPath(workspace.path, projects)?.projectId
  }

  /**
   * 把会话归并到项目：确保它挂在该项目下的工作区里。
   * 1) 项目下已有一个工作区与会话目录一致 → 直接移入（真正的多工作树命中）；
   * 2) 否则落入项目基本盘（首个归属工作区）；
   * 3) 项目还没有任何工作区时，以会话目录补建工作区并纳入项目 roots，再移入。
   */
  const moveSessionToProject = async (sessionId: SessionId, projectId: string): Promise<void> => {
    const project = projects.find(item => item.projectId === projectId)
    if (project === undefined) return
    const cwd = list.byId[sessionId]?.cwd
    const owned = workspaces.filter(ws => projectForPath(ws.path, [project]) !== undefined)
    const matching = cwd === undefined || cwd === ''
      ? undefined
      : owned.find(ws => pathKey(ws.path) === pathKey(cwd))
    if (matching !== undefined) {
      await moveSession(matching.workspaceId, sessionId)
      return
    }
    if (owned.length > 0) {
      await moveSession(owned[0]!.workspaceId, sessionId)
      return
    }
    if (cwd === undefined || cwd === '') return
    const created = await createWorkspace({ path: cwd })
    if (!project.roots.some(root => pathKey(root) === pathKey(created.path))) {
      await setProjectRoots(projectId, [...project.roots, created.path])
      await refreshProjects()
    }
    await moveSession(created.workspaceId, sessionId)
  }

  const toggleSet = (prev: ReadonlySet<string>, key: string): ReadonlySet<string> => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }

  const beginRename = (sessionId: SessionId, title: string): void => {
    setRenaming(sessionId); setRenameDraft(title); setMenu(null)
  }
  const commitRename = async (sessionId: SessionId): Promise<void> => {
    const title = renameDraft; setRenaming(null)
    if (title.trim() === '') return
    try { await renameSession(sessionId, title.trim()) } catch { /* 保留旧标题 */ }
  }
  const beginWorkspaceRename = (workspaceId: string, title: string): void => {
    setRenaming(`ws:${workspaceId}`); setRenameDraft(title); setMenu(null)
  }
  const commitWorkspaceRename = async (workspaceId: string): Promise<void> => {
    const title = renameDraft; setRenaming(null)
    if (title.trim() === '') return
    try { await renameWorkspace(workspaceId, title.trim()) } catch { /* 保留旧标题 */ }
  }

  const openMenu = (event: React.MouseEvent, target: BrowserMenuTarget): void => {
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, ...target })
  }

  /** 项目下所有会话：按项目 roots 前缀命中的工作区汇总。 */
  const projectSessionIds = (projectId: string): readonly SessionId[] => {
    const project = projects.find(item => item.projectId === projectId)
    if (project === undefined) return []
    return workspaces
      .filter(ws => projectForPath(ws.path, [project]) !== undefined)
      .flatMap(ws => ws.sessionIds)
  }

  const projectActions = (projectId: string): ProjectMenuActions => {
    const project = projects.find(item => item.projectId === projectId)
    const name = project?.name ?? ''
    return {
      rename: () => {
        setMenu(null)
        const next = window.prompt(t('renameProject'), name)
        if (next === null || next.trim() === '' || next.trim() === name) return
        void renameProject(projectId, next.trim()).then(() => refreshProjects()).catch(() => { /* 保留旧名 */ })
      },
      manageWorktrees: () => { setMenu(null); setWorktreeProjectId(projectId) },
      archiveAllSessions: () => {
        setMenu(null)
        for (const sessionId of projectSessionIds(projectId)) void archiveSession(sessionId)
      },
      deleteProject: () => {
        setMenu(null)
        if (!window.confirm(t('deleteProjectConfirm', { name }))) return
        void deleteProject(projectId).then(() => refreshProjects()).catch(() => { /* 删除失败保留项目 */ })
      },
    }
  }

  const sessionActions = (sessionId: SessionId): SessionMenuActions => {
    const row = meta.meta(sessionId)
    return {
      pinned: row.pinned,
      unread: row.unread,
      cwd: list.byId[sessionId]?.cwd,
      markdownAvailable: canExportMarkdown,
      rename: () => { beginRename(sessionId, list.byId[sessionId]?.displayTitle ?? '') },
      togglePin: () => { meta.set(sessionId, { pinned: !row.pinned }); setMenu(null); bump(n => n + 1) },
      toggleUnread: () => { meta.set(sessionId, { unread: !row.unread }); setMenu(null); bump(n => n + 1) },
      archive: () => { setMenu(null); void archiveSession(sessionId) },
      moveToProject: (projectId) => {
        setMenu(null)
        void moveSessionToProject(sessionId, projectId).catch(() => {
          // 归并失败（项目被删/目录不可用）时保持原归属
        })
      },
      moveToUngrouped: () => {
        const workspaceId = sessionWorkspaceId(sessionId)
        setMenu(null)
        if (workspaceId === undefined) return
        void detachSession(workspaceId, sessionId)
      },
      canMoveToUngrouped: sessionWorkspaceId(sessionId) !== undefined,
      copyCwd: () => { setMenu(null); void copyText(list.byId[sessionId]?.cwd ?? '') },
      copyLink: () => {
        setMenu(null)
        void copyText(`${window.location.origin}${window.location.pathname}${deepLink(sessionId)}`)
      },
      copyMarkdown: () => {
        setMenu(null)
        void exportSessionMarkdown(sessionId).then(text => {
          if (text !== null) void copyText(text)
        })
      },
      fork: () => { setMenu(null); forkSession(sessionId) },
      openInExplorer: () => {
        setMenu(null)
        const path = list.byId[sessionId]?.cwd
        if (path !== undefined && path !== '') void openWorkspacePath(path)
      },
      openInTerminal: () => {
        setMenu(null)
        void openTerminalForSession(sessionId, list.byId[sessionId]?.cwd)
      },
      openNewWindow: () => {
        setMenu(null)
        window.open(`${window.location.pathname}${deepLink(sessionId)}`, '_blank')
      },
    }
  }

  const workspaceActions = (workspaceId: string): WorkspaceMenuActions => {
    const workspace = workspaces.find(item => item.workspaceId === workspaceId)
    const pinned = prefs.workspacePinned(workspaceId)
    return {
      pinned,
      togglePin: () => {
        prefs.setWorkspacePinned(workspaceId, !pinned)
        setMenu(null)
        bump(n => n + 1)
      },
      rename: () => { beginWorkspaceRename(workspaceId, workspace?.title ?? '') },
      openInExplorer: () => {
        setMenu(null)
        if (workspace?.path !== undefined) void openWorkspacePath(workspace.path)
      },
      archiveAllSessions: () => {
        setMenu(null)
        for (const id of workspace?.sessionIds ?? []) void archiveSession(id)
      },
      deleteWorkspace: () => { setMenu(null); void deleteWorkspace(workspaceId) },
      startSession: () => { setMenu(null); startSession(workspaceId) },
    }
  }

  return (
    <div className={wide ? css.root : `${css.root} ${css.rail}`}>
      <div className={css.searchBar}>
        <Search size={13} style={{ flex: 'none', opacity: 0.6 }} />
        <input
          ref={searchInput}
          className={css.search}
          type="text"
          placeholder={t('searchPlaceholder')}
          value={search.query}
          onChange={event => { setQuery(event.target.value) }}
          onKeyDown={event => { if (event.key === 'Escape') clearSearch() }}
        />
        {search.query !== '' && (
          <button type="button" className={css.clearButton} title={t('clearSearch')}
            aria-label={t('clearSearch')}
            onClick={clearSearch}>
            <X size={12} />
          </button>
        )}
      </div>
      {!wide && (
        <div className={css.railControls}>
          <button type="button" className={css.railButton} title={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            onClick={() => { setSearchOnExpand(true); expandSidebar() }}>
            <Search size={18} />
          </button>
        </div>
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
          renaming={renaming}
          renameDraft={renameDraft}
          organize={prefsSnap.organize}
          sort={prefsSnap.sort}
          prefs={prefs}
          projects={projects}
          onToggleGroup={key => {
            const next = toggleSet(collapsed, key)
            setCollapsed(next)
            prefs.setCollapsedGroups([...next])
          }}
          onOpen={open}
          onWorkspaceMenu={(event, workspaceId) => { openMenu(event, { kind: 'workspace', workspaceId }) }}
          onSessionMenu={(event, sessionId) => { openMenu(event, { kind: 'session', sessionId }) }}
          onProjectMenu={(event, projectId) => { openMenu(event, { kind: 'project', projectId }) }}
          onArchiveSession={sessionId => { void archiveSession(sessionId) }}
          onRestoreSession={sessionId => { void unarchiveSession(sessionId) }}
          onToggleWorkspacePin={workspaceId => {
            prefs.setWorkspacePinned(workspaceId, !prefs.workspacePinned(workspaceId))
            bump(n => n + 1)
          }}
          onToggleProjectPin={projectId => {
            prefs.setProjectPinned(projectId, !prefs.projectPinned(projectId))
            bump(n => n + 1)
          }}
          onNewSession={workspaceId => { startSession(workspaceId) }}
          onBeginWorkspaceRename={beginWorkspaceRename}
          setRenameDraft={setRenameDraft}
          commitRename={sessionId => { void commitRename(sessionId) }}
          commitWorkspaceRename={workspaceId => { void commitWorkspaceRename(workspaceId) }}
          onSessionDrop={(sessionId, beforeSessionId, workspaceId, fromWorkspaceId) => {
            if (fromWorkspaceId !== undefined && fromWorkspaceId !== workspaceId) {
              void moveSession(workspaceId, sessionId)
            } else {
              void insertSessionBefore(workspaceId, sessionId, beforeSessionId)
            }
          }}
          sessionWorkspaceId={sessionWorkspaceId}
          meta={meta}
          t={t}
        />
      </div>
      <BrowserMenu
        state={menu}
        onDismiss={() => { setMenu(null) }}
        sessionActions={sessionActions}
        workspaceActions={workspaceActions}
        projectActions={projectActions}
        projects={projects}
        sessionProjectId={sessionProjectId}
        sessionCwd={sessionId => list.byId[sessionId]?.cwd}
        projectName={projectId => projects.find(item => item.projectId === projectId)?.name ?? ''}
        t={t}
      />
      <ProjectCreateModal
        open={createProjectOpen}
        workspaces={workspaces}
        fsList={fsList}
        createWorkspace={createWorkspace}
        createProject={createProject}
        onCreated={() => { void refreshProjects() }}
        onClose={() => { setCreateProjectOpen(false) }}
        t={t}
      />
      <ProjectWorktreesModal
        project={projects.find(item => item.projectId === worktreeProjectId) ?? null}
        workspaces={workspaces}
        fsList={fsList}
        onSave={async (projectId, roots) => {
          await setProjectRoots(projectId, roots)
          await refreshProjects()
        }}
        onClose={() => { setWorktreeProjectId(null) }}
        t={t}
      />
    </div>
  )
}
