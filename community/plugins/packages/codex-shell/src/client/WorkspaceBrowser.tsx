/**
 * Codex-styled workspace/session browser occupying the sidebar's browsing
 * region. Top-level sessions group by workspace; subagent sessions nest under
 * their parent as an expandable tree (Codex-style), and blank placeholders
 * stay out of the list. Right-click opens the session context menu.
 */
import { useMemo, useState } from 'react'
import {
  Archive, ChevronDown, ChevronRight, ExternalLink, FilePlus2, Folder, FolderPlus,
  GitFork, Hash, Inbox, Link2, MoreHorizontal, Pencil, Pin, Search, Trash2, X, CircleDot,
} from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import { useSessionMeta } from './session-meta.js'
import type {
  HostObservableLike, RenderSlotFn, SearchResultLike, SelectorHook, SessionId, SessionListStateLike,
  TFn, WorkspaceSnapshotLike, WorkspaceViewLike,
} from './faces.js'
import css from './styles.module.css'

/** Injected share for the browser (mirrors the native WorkspaceBrowser actions). */
export interface CodexBrowserInjected {
  hooks: {
    directoryFlow: HostObservableLike<boolean>
    hostInfo: HostObservableLike<unknown>
  }
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
  createWorkspace: (input: { path: string }) => Promise<WorkspaceViewLike>
  meta: SessionMetaStore
}

export interface CodexBrowserProps {
  wide: boolean
  expandSidebar: () => void
  useSessions: SelectorHook<SessionListStateLike>
  useWorkspaces: SelectorHook<WorkspaceSnapshotLike>
  useDirectoryFlow: () => boolean
  useHostInfo: () => unknown
  renderSlot: RenderSlotFn
  startSession: (workspaceId?: string) => void
  open: (sessionId: SessionId) => void
  searchSessions: CodexBrowserInjected['searchSessions']
  searchResultLimit: number
  renameSession: CodexBrowserInjected['renameSession']
  forkSession: CodexBrowserInjected['forkSession']
  renameWorkspace: CodexBrowserInjected['renameWorkspace']
  deleteWorkspace: CodexBrowserInjected['deleteWorkspace']
  insertWorkspaceBefore: CodexBrowserInjected['insertWorkspaceBefore']
  archiveSession: CodexBrowserInjected['archiveSession']
  insertSessionBefore: CodexBrowserInjected['insertSessionBefore']
  createWorkspace: CodexBrowserInjected['createWorkspace']
  meta: SessionMetaStore
  t: TFn
}

interface MenuState {
  x: number
  y: number
  sessionId?: SessionId
  workspaceId?: string
  isWorkspace: boolean
}

interface SearchState {
  query: string
  items: readonly SearchResultLike[]
  loading: boolean
}

/** One nested subagent row's durable facts. */
interface SubagentLike {
  id: SessionId
  title: string
  current: boolean
  running: boolean
}

/** Compose a deep link for one session. */
function deepLink(sessionId: SessionId): string {
  return `?session=${sessionId}`
}

/** Compact relative age for the row subline. */
function timeAgo(at: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(at).toLocaleDateString()
}

/** Subline for a row: basename of cwd, else relative age. */
function sublineFor(cwd: string | undefined, updatedAt: number, now: number): string {
  if (cwd !== undefined && cwd !== '') {
    const idx = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'))
    const base = idx < 0 ? cwd : cwd.slice(idx + 1)
    if (base !== '') return base
  }
  return timeAgo(updatedAt, now)
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard may be unavailable (permissions, non-secure context).
  }
}

export function CodexBrowser(props: CodexBrowserProps) {
  const {
    useSessions, useWorkspaces, renderSlot, startSession, open, searchSessions,
    renameSession, forkSession, renameWorkspace, deleteWorkspace, archiveSession, createWorkspace, meta, t,
  } = props
  const list = useSessions(state => state)
  const workspaces = useWorkspaces(state => state.items)
  const archivedIds = useWorkspaces(state => state.archivedSessionIds)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [search, setSearch] = useState<SearchState>({ query: '', items: [], loading: false })
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [flowOpen, setFlowOpen] = useState(false)
  const [flowBusy, setFlowBusy] = useState(false)
  const [flowError, setFlowError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  /** Top-level rows (blank placeholders and subagents excluded) and subagent trees. */
  const groups = useMemo(() => {
    const visible = (id: SessionId): boolean => {
      const summary = list.byId[id]
      return summary !== undefined && !summary.blank && !archivedIds.includes(id)
    }
    const topLevel = new Set<SessionId>()
    for (const id of list.ids) {
      const summary = list.byId[id]
      if (summary === undefined || summary.blank) continue
      if (summary.origin !== 'subagent') topLevel.add(id)
      else if (!(summary.parentId !== undefined && visible(summary.parentId))) topLevel.add(id)
    }
    const accounted = new Set<string>()
    const grouped: { workspace: WorkspaceViewLike; sessions: SessionId[] }[] = []
    for (const workspace of workspaces) {
      const rows = workspace.sessionIds.filter(id => topLevel.has(id) && !archivedIds.includes(id))
      for (const id of workspace.sessionIds) accounted.add(id)
      grouped.push({ workspace, sessions: rows })
    }
    const ungrouped = [...topLevel].filter(id => !accounted.has(id) && !archivedIds.includes(id))
    ungrouped.sort((left, right) => list.ids.indexOf(left) - list.ids.indexOf(right))
    return { grouped, ungrouped, archived: archivedIds.filter(id => list.byId[id] !== undefined) }
  }, [workspaces, archivedIds, list.ids, list.byId])

  const openMenu = (event: React.MouseEvent, state: Omit<MenuState, 'x' | 'y'>): void => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, ...state })
  }

  const beginRename = (sessionId: SessionId, title: string): void => {
    setRenaming(sessionId)
    setRenameDraft(title)
    setMenu(null)
  }

  const commitRename = async (sessionId: SessionId): Promise<void> => {
    const title = renameDraft
    setRenaming(null)
    if (title.trim() === '') return
    try { await renameSession(sessionId, title.trim()) } catch { /* rename failure keeps the old title */ }
  }

  const beginWorkspaceRename = (workspaceId: string, title: string): void => {
    setRenaming(`ws:${workspaceId}`)
    setRenameDraft(title)
    setMenu(null)
  }

  const commitWorkspaceRename = async (workspaceId: string): Promise<void> => {
    const title = renameDraft
    setRenaming(null)
    if (title.trim() === '') return
    try { await renameWorkspace(workspaceId, title.trim()) } catch { /* rename failure keeps the old title */ }
  }

  const toggleGroup = (key: string): void => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const runSearch = async (value: string): Promise<void> => {
    const query = value.trim()
    if (query === '') {
      setSearch({ query: '', items: [], loading: false })
      return
    }
    setSearch(prev => ({ ...prev, loading: true }))
    try {
      const result = await searchSessions(query, new AbortController().signal)
      setSearch({ query, items: result.items, loading: false })
    } catch {
      setSearch({ query, items: [], loading: false })
    }
  }

  const sessionRow = (sessionId: SessionId, archived = false) => {
    const summary = list.byId[sessionId]
    if (summary === undefined) return null
    const subagents: SubagentLike[] = list.ids.flatMap(id => {
      const child = list.byId[id]
      if (child === undefined || child.parentId !== sessionId || child.origin !== 'subagent' || child.blank) return []
      return [{ id, title: child.displayTitle, current: list.current === id, running: child.running }]
    })
    return <SessionRow
      key={sessionId}
      sessionId={sessionId}
      title={summary.displayTitle}
      subline={sublineFor(summary.cwd, summary.updatedAt, Date.now())}
      cwd={summary.cwd}
      current={list.current === sessionId}
      running={summary.running}
      completed={summary.completed === true}
      archived={archived}
      subagents={subagents}
      expanded={!collapsed.has(`sub:${sessionId}`)}
      onToggleSubagents={() => { toggleGroup(`sub:${sessionId}`) }}
      renaming={renaming === sessionId}
      renameDraft={renaming === sessionId ? renameDraft : ''}
      setRenameDraft={setRenameDraft}
      commitRename={() => { void commitRename(sessionId) }}
      onOpen={() => { open(sessionId) }}
      onMenu={event => openMenu(event, { sessionId, isWorkspace: false })}
      meta={meta}
      open={open}
      t={t}
    />
  }

  const renderMenu = (): React.ReactNode => {
    if (menu === null) return null
    return <div className={css.menu} style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(null)}>
      {menu.isWorkspace && menu.workspaceId !== undefined && (
        <>
          <button type="button" className={css.menuItem} onClick={() => {
            const workspace = workspaces.find(item => item.workspaceId === menu.workspaceId)
            beginWorkspaceRename(menu.workspaceId as string, workspace?.title ?? '')
          }}><Pencil size={13} className={css.menuIcon} />{t('renameWorkspace')}</button>
          <button type="button" className={css.menuItemDanger} onClick={() => {
            setMenu(null)
            void deleteWorkspace(menu.workspaceId as string)
          }}><Trash2 size={13} className={css.menuIcon} />{t('deleteWorkspace')}</button>
        </>
      )}
      {!menu.isWorkspace && menu.sessionId !== undefined && (
        <>
          <button type="button" className={css.menuItem} onClick={() => {
            setMenu(null)
            forkSession(menu.sessionId as SessionId)
          }}><GitFork size={13} className={css.menuIcon} />{t('forkSession')}</button>
          <button type="button" className={css.menuItem} onClick={() => {
            const summary = list.byId[menu.sessionId as SessionId]
            beginRename(menu.sessionId as SessionId, summary?.displayTitle ?? '')
          }}><Pencil size={13} className={css.menuIcon} />{t('rename')}</button>
          <button type="button" className={css.menuItem} onClick={() => {
            setMenu(null)
            void archiveSession(menu.sessionId as SessionId)
          }}><Archive size={13} className={css.menuIcon} />{t('archive')}</button>
          <div className={css.menuSep} />
          <button type="button" className={css.menuItem} onClick={() => {
            const summary = list.byId[menu.sessionId as SessionId]
            setMenu(null)
            void copyText(summary?.cwd ?? '')
          }}><Folder size={13} className={css.menuIcon} />{t('copyCwd')}</button>
          <button type="button" className={css.menuItem} onClick={() => {
            setMenu(null)
            void copyText(menu.sessionId as string)
          }}><Hash size={13} className={css.menuIcon} />{t('copyId')}</button>
          <button type="button" className={css.menuItem} onClick={() => {
            setMenu(null)
            void copyText(`${window.location.origin}${window.location.pathname}${deepLink(menu.sessionId as SessionId)}`)
          }}><Link2 size={13} className={css.menuIcon} />{t('copyLink')}</button>
          <button type="button" className={css.menuItem} onClick={() => {
            setMenu(null)
            window.open(`${window.location.pathname}${deepLink(menu.sessionId as SessionId)}`, '_blank')
          }}><ExternalLink size={13} className={css.menuIcon} />{t('openInNewWindow')}</button>
        </>
      )}
    </div>
  }

  const searching = search.query !== ''

  return (
    <div className={css.root}>
      <div className={css.header}>
        <span className={css.title}>{t('sidebarTitle')}</span>
        <button type="button" className={css.iconButton} title={t('addWorkspace')}
          onClick={() => { setFlowOpen(true) }}>
          <FolderPlus size={15} />
        </button>
      </div>
      <button type="button" className={css.newSession} onClick={() => { startSession() }}>
        <FilePlus2 size={14} />
        {t('newSession')}
      </button>
      <div className={css.searchWrap}>
        <Search size={13} style={{ flex: 'none', opacity: 0.55 }} />
        <input
          className={css.search}
          placeholder={t('searchPlaceholder')}
          value={search.query}
          onChange={event => { setSearch(prev => ({ ...prev, query: event.target.value })); void runSearch(event.target.value) }}
        />
        {search.query !== '' && (
          <button type="button" className={css.iconButton} style={{ width: 20, height: 20 }}
            title={t('clearSearch')}
            onClick={() => { setSearch({ query: '', items: [], loading: false }) }}>
            <X size={12} />
          </button>
        )}
      </div>
      <div className={css.scroll}>
        {searching
          ? (search.loading
              ? <div className={css.empty}>{t('pluginLoading')}</div>
              : search.items.length === 0
                ? <div className={css.empty}>{t('filesEmpty')}</div>
                : search.items.map(item => (
                  <div key={item.sessionId} className={css.row} onClick={() => { open(item.sessionId) }}>
                    <CircleDot size={12} style={{ flex: 'none', opacity: 0.6 }} />
                    <span className={css.rowLabel}>{list.byId[item.sessionId]?.displayTitle ?? item.sessionId}</span>
                    <span style={{ fontSize: 11, opacity: 0.55 }}>{item.snippet}</span>
                  </div>
                )))
          : (
            <>
              {groups.grouped.length === 0 && groups.ungrouped.length === 0 && groups.archived.length === 0 && (
                <div className={css.emptyWrap}>
                  <Inbox size={22} />
                  <span className={css.emptyTitle}>{t('sidebarEmptyTitle')}</span>
                  <span>{t('sidebarEmptyHint')}</span>
                </div>
              )}
              {groups.grouped.map(({ workspace, sessions }) => {
                const key = `ws:${workspace.workspaceId}`
                const isCollapsed = collapsed.has(key)
                return (
                  <div key={key} className={css.group}>
                    <div className={css.groupHead} onClick={() => { toggleGroup(key) }}
                      onContextMenu={event => openMenu(event, { workspaceId: workspace.workspaceId, isWorkspace: true })}>
                      {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                      <Folder size={12} className={css.groupIcon} />
                      <span className={css.groupName}>{workspace.title}</span>
                      <span className={css.count}>{sessions.length}</span>
                    </div>
                    {!isCollapsed && sessions.map(id => sessionRow(id))}
                  </div>
                )
              })}
              {groups.ungrouped.length > 0 && (
                <div className={css.group}>
                  <div className={css.groupHead} onClick={() => { toggleGroup('ungrouped') }}>
                    {collapsed.has('ungrouped') ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                    <span className={css.groupName}>{t('ungrouped')}</span>
                    <span className={css.count}>{groups.ungrouped.length}</span>
                  </div>
                  {!collapsed.has('ungrouped') && groups.ungrouped.map(id => sessionRow(id))}
                </div>
              )}
              {groups.archived.length > 0 && (
                <div className={css.group}>
                  <div className={css.groupHead} onClick={() => { toggleGroup('archived') }}>
                    {collapsed.has('archived') ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                    <span className={css.groupName}>{t('archived')}</span>
                    <span className={css.count}>{groups.archived.length}</span>
                  </div>
                  {!collapsed.has('archived') && groups.archived.map(id => sessionRow(id, true))}
                </div>
              )}
              {flowOpen && renderSlot('sidebar.workspaces.directoryFlow', {
                open: flowOpen,
                busy: flowBusy,
                onPicked: (path: string) => {
                  setFlowBusy(true)
                  createWorkspace({ path })
                    .then(() => { setFlowOpen(false); setFlowBusy(false); setFlowError(null) })
                    .catch(error => { setFlowBusy(false); setFlowError(error instanceof Error ? error.message : String(error)) })
                },
                onCancel: () => { setFlowOpen(false); setFlowError(null) },
                onError: (message: string) => { setFlowError(message) },
              })}
              {flowError !== null && <div className={css.error}>{flowError}</div>}
            </>
          )}
      </div>
      {renderMenu()}
    </div>
  )
}

interface SessionRowProps {
  sessionId: SessionId
  title: string
  subline: string
  cwd?: string | undefined
  current: boolean
  running: boolean
  completed: boolean
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

function SessionRow(props: SessionRowProps): React.ReactNode {
  const [rowMeta, updateMeta] = useSessionMeta(props.meta, props.sessionId)
  const className = props.current ? css.rowCurrent : css.row
  return (
    <>
      <div className={className}
        onClick={props.onOpen}
        onContextMenu={props.onMenu}
        title={props.cwd ?? props.sessionId}>
        <span className={props.running ? css.dotRunning : props.completed ? css.dotCompleted : props.archived ? css.dotArchived : css.dot} />
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
          : (
            <div className={css.rowText}>
              <span className={css.rowLabel}>{props.title}</span>
              <span className={css.rowSub}>{props.subline}</span>
            </div>
          )}
        <span className={css.rowMeta}>
          {props.subagents.length > 0 && (
            <button type="button" className={css.chevron} title={`${props.subagents.length} ${props.t('subagents')}`}
              onClick={event => { event.stopPropagation(); props.onToggleSubagents() }}>
              {props.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span style={{ fontSize: 10, opacity: 0.75 }}>{props.subagents.length}</span>
            </button>
          )}
          {rowMeta.pinned && (
            <button type="button" className={css.iconButtonActive} title={props.t('unpin')}
              onClick={event => { event.stopPropagation(); updateMeta({ pinned: false }) }}>
              <Pin size={11} />
            </button>
          )}
          {rowMeta.unread && <span className={css.badge} aria-hidden="true" />}
          <button type="button" className={`${css.iconButton} ${css.reveal}`}
            onClick={props.onMenu}>
            <MoreHorizontal size={14} />
          </button>
        </span>
      </div>
      {props.expanded && props.subagents.map(sub => (
        <div key={sub.id} className={css.subRow}
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
