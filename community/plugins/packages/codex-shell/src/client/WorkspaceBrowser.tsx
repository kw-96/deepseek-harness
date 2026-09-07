/**
 * 侧栏工作区/会话浏览器：Codex 式搜索、项目标题栏、分组树与嵌套菜单。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import { BrowserMenu, type BrowserMenuState } from './browser-menu.js'
import { BrowserTree } from './browser-tree.js'
import { SectionHeader } from './sidebar/section-header.js'
import { buildGroupsModel } from './sidebar/groups.js'
import { useBrowserPrefs, type BrowserPrefsStore } from './sidebar/prefs.js'
import { requestAddWorkspaceOpen } from './sidebar/add-workspace-bus.js'
import { useSessionSearch } from './sidebar/search/use-session-search.js'
import type { SessionMenuActions } from './sidebar/session-menu.js'
import type { WorkspaceMenuActions } from './sidebar/workspace-menu.js'
import type {
  SearchResultLike, SelectorHook, SessionId, SessionListStateLike,
  TFn, WorkspaceSnapshotLike,
} from './faces.js'
import css from './styles.module.css'

const EXPAND_SLIDE_MS = 300

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
  insertWorkspaceBefore: (workspaceId: string, beforeWorkspaceId?: string) => Promise<void>
  archiveSession: (sessionId: SessionId) => Promise<void>
  insertSessionBefore: (workspaceId: string, sessionId: SessionId, beforeSessionId?: SessionId) => Promise<void>
  attachSession: (workspaceId: string, sessionId: SessionId) => Promise<void>
  moveSession: (workspaceId: string, sessionId: SessionId) => Promise<void>
  detachSession: (workspaceId: string, sessionId: SessionId) => Promise<void>
  openWorkspacePath: (path: string) => Promise<void>
  openTerminalForSession: (sessionId: SessionId, cwd?: string) => Promise<void>
  exportSessionMarkdown: (sessionId: SessionId) => Promise<string | null>
  canExportMarkdown: boolean
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
    renameSession, forkSession, renameWorkspace, deleteWorkspace, archiveSession,
    insertSessionBefore, moveSession, detachSession, openWorkspacePath, openTerminalForSession,
    exportSessionMarkdown, canExportMarkdown, meta, prefs, t,
  } = props
  const list = useSessions(state => state)
  const workspaces = useWorkspaces(state => state.items)
  const archivedIds = useWorkspaces(state => state.archivedSessionIds)
  const [menu, setMenu] = useState<BrowserMenuState | null>(null)
  const { search, setQuery, clear: clearSearch } = useSessionSearch(searchSessions)
  const [searchOnExpand, setSearchOnExpand] = useState(false)
  const searchInput = useRef<HTMLInputElement | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [collapsedSubagents, setCollapsedSubagents] = useState<ReadonlySet<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [prefsSnap, setPrefs] = useBrowserPrefs(prefs)
  const [rev, bump] = useState(0)

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

  const openMenu = (event: React.MouseEvent, state: Omit<BrowserMenuState, 'x' | 'y'>): void => {
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, ...state })
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
      moveToWorkspace: (workspaceId) => {
        setMenu(null)
        void moveSession(workspaceId, sessionId)
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
          onOrganize={mode => { setPrefs({ organize: mode }); bump(n => n + 1) }}
          onSort={mode => { setPrefs({ sort: mode }); bump(n => n + 1) }}
          onAddWorkspace={requestAddWorkspaceOpen}
          t={t}
        />
      )}
      <div className={css.treeBody} role="tree" aria-label={t('sidebarTitle')}>
        <BrowserTree
          groups={groups}
          list={list}
          collapsed={collapsed}
          collapsedSubagents={collapsedSubagents}
          searching={search.query !== ''}
          searchItems={search.items}
          searchLoading={search.loading}
          renaming={renaming}
          renameDraft={renameDraft}
          organize={prefsSnap.organize}
          sort={prefsSnap.sort}
          prefs={prefs}
          onToggleGroup={key => { setCollapsed(prev => toggleSet(prev, key)) }}
          onOpen={open}
          onWorkspaceMenu={(event, workspaceId) => { openMenu(event, { workspaceId, isWorkspace: true }) }}
          onSessionMenu={(event, sessionId) => { openMenu(event, { sessionId, isWorkspace: false }) }}
          onArchiveSession={sessionId => { void archiveSession(sessionId) }}
          onToggleWorkspacePin={workspaceId => {
            prefs.setWorkspacePinned(workspaceId, !prefs.workspacePinned(workspaceId))
            bump(n => n + 1)
          }}
          onBeginWorkspaceRename={beginWorkspaceRename}
          onToggleSubagents={key => { setCollapsedSubagents(prev => toggleSet(prev, key)) }}
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
        workspaces={workspaces}
        sessionWorkspaceId={sessionWorkspaceId}
        sessionCwd={sessionId => list.byId[sessionId]?.cwd}
        t={t}
      />
    </div>
  )
}
