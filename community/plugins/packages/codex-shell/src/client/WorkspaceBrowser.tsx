/**
 * 侧栏工作区/会话浏览器（占用 sidebar.workspaces，优先级 -1 遮蔽原生
 * 浏览器）：参考 Codex 左侧栏排布 —— 常驻圆角搜索框、细字工作区标题、
 * 单行会话、悬停显露的时间与操作；保留插件特有功能（子代理嵌套树、
 * 置顶/未读、行操作菜单）。添加工作区入口移至侧栏页脚（footer.action）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import { BrowserMenu, type BrowserMenuActions, type BrowserMenuState } from './browser-menu.js'
import { BrowserTree, type GroupsModel } from './browser-tree.js'
import type {
  SearchResultLike, SelectorHook, SessionId, SessionListStateLike,
  TFn, WorkspaceSnapshotLike,
} from './faces.js'
import css from './styles.module.css'

/** 轨道态点搜索 → 展开动画结束后聚焦输入框的等待时长。 */
const EXPAND_SLIDE_MS = 300

/** 注入共享面（镜像原生 WorkspaceBrowser 动作）。 */
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
  meta: SessionMetaStore
}

export interface CodexBrowserProps extends CodexBrowserInjected {
  wide: boolean
  expandSidebar: () => void
  useSessions: SelectorHook<SessionListStateLike>
  useWorkspaces: SelectorHook<WorkspaceSnapshotLike>
  t: TFn
}

interface SearchState {
  query: string
  items: readonly SearchResultLike[]
  loading: boolean
}

/** 拼接会话深链接。 */
function deepLink(sessionId: SessionId): string {
  return `?session=${sessionId}`
}

/** 尽力复制文本到剪贴板。 */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 剪贴板不可用（权限或非安全上下文）时静默跳过。
  }
}

export function CodexBrowser(props: CodexBrowserProps) {
  const {
    wide, expandSidebar, useSessions, useWorkspaces, startSession, open, searchSessions,
    renameSession, forkSession, renameWorkspace, deleteWorkspace, archiveSession, meta, t,
  } = props
  const list = useSessions(state => state)
  const workspaces = useWorkspaces(state => state.items)
  const archivedIds = useWorkspaces(state => state.archivedSessionIds)
  const [menu, setMenu] = useState<BrowserMenuState | null>(null)
  const [search, setSearch] = useState<SearchState>({ query: '', items: [], loading: false })
  const [searchOnExpand, setSearchOnExpand] = useState(false)
  const searchInput = useRef<HTMLInputElement | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [collapsedSubagents, setCollapsedSubagents] = useState<ReadonlySet<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  // 轨道态点搜索：展开后延迟聚焦，避开侧栏滑动动画。
  useEffect(() => {
    if (!(wide && searchOnExpand)) return
    const timer = window.setTimeout(() => {
      searchInput.current?.focus({ preventScroll: true })
      setSearchOnExpand(false)
    }, EXPAND_SLIDE_MS)
    return () => { window.clearTimeout(timer) }
  }, [wide, searchOnExpand])

  /** 顶层行（剔除空白占位与子代理）与子代理树的分组投影。 */
  const groups: GroupsModel = useMemo(() => {
    const visible = (id: SessionId): boolean => {
      const summary = list.byId[id]
      return summary !== undefined && !summary.blank && !archivedIds.includes(id)
    }
    // 分组内按最近使用排序（updatedAt 降序，同序回退列表顺序）。
    const byRecency = (ids: readonly SessionId[]): SessionId[] => {
      const order = new Map(ids.map((id, index) => [id, index]))
      return [...ids].sort((left, right) => {
        const diff = (list.byId[right]?.updatedAt ?? 0) - (list.byId[left]?.updatedAt ?? 0)
        if (diff !== 0) return diff
        return (order.get(left) ?? 0) - (order.get(right) ?? 0)
      })
    }
    const topLevel = new Set<SessionId>()
    for (const id of list.ids) {
      const summary = list.byId[id]
      if (summary === undefined || summary.blank) continue
      if (summary.origin !== 'subagent') topLevel.add(id)
      else if (!(summary.parentId !== undefined && visible(summary.parentId))) topLevel.add(id)
    }
    const accounted = new Set<string>()
    const grouped: GroupsModel['grouped'] = []
    for (const workspace of workspaces) {
      const rows = byRecency(workspace.sessionIds.filter(id => topLevel.has(id) && !archivedIds.includes(id)))
      for (const id of workspace.sessionIds) accounted.add(id)
      grouped.push({ workspace, sessions: rows })
    }
    const ungrouped = byRecency([...topLevel].filter(id => !accounted.has(id) && !archivedIds.includes(id)))
    return { grouped, ungrouped, archived: byRecency(archivedIds.filter(id => list.byId[id] !== undefined)) }
  }, [workspaces, archivedIds, list.ids, list.byId])

  const toggleGroup = (key: string): void => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSubagents = (key: string): void => {
    setCollapsedSubagents(prev => {
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

  const beginRename = (sessionId: SessionId, title: string): void => {
    setRenaming(sessionId)
    setRenameDraft(title)
    setMenu(null)
  }

  const commitRename = async (sessionId: SessionId): Promise<void> => {
    const title = renameDraft
    setRenaming(null)
    if (title.trim() === '') return
    try { await renameSession(sessionId, title.trim()) } catch { /* 重命名失败保留旧标题 */ }
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
    try { await renameWorkspace(workspaceId, title.trim()) } catch { /* 重命名失败保留旧标题 */ }
  }

  const menuActions: BrowserMenuActions = {
    startSessionInWorkspace: (workspaceId) => {
      setMenu(null)
      startSession(workspaceId)
    },
    renameWorkspace: (workspaceId) => {
      const workspace = workspaces.find(item => item.workspaceId === workspaceId)
      beginWorkspaceRename(workspaceId, workspace?.title ?? '')
    },
    deleteWorkspace: (workspaceId) => {
      setMenu(null)
      void deleteWorkspace(workspaceId)
    },
    forkSession: (sessionId) => {
      setMenu(null)
      forkSession(sessionId)
    },
    renameSession: (sessionId) => {
      const summary = list.byId[sessionId]
      beginRename(sessionId, summary?.displayTitle ?? '')
    },
    archiveSession: (sessionId) => {
      setMenu(null)
      void archiveSession(sessionId)
    },
    copyCwd: (sessionId) => {
      const summary = list.byId[sessionId]
      setMenu(null)
      void copyText(summary?.cwd ?? '')
    },
    copyId: (sessionId) => {
      setMenu(null)
      void copyText(sessionId)
    },
    copyLink: (sessionId) => {
      setMenu(null)
      void copyText(`${window.location.origin}${window.location.pathname}${deepLink(sessionId)}`)
    },
    openNewWindow: (sessionId) => {
      setMenu(null)
      window.open(`${window.location.pathname}${deepLink(sessionId)}`, '_blank')
    },
  }

  const openMenu = (event: React.MouseEvent, state: Omit<BrowserMenuState, 'x' | 'y'>): void => {
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, ...state })
  }

  const clearSearch = (): void => {
    setSearch({ query: '', items: [], loading: false })
  }

  const searching = search.query !== ''

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
          onChange={event => { setSearch(prev => ({ ...prev, query: event.target.value })); void runSearch(event.target.value) }}
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
      <div className={css.treeBody} role="tree" aria-label={t('sidebarTitle')}>
        <BrowserTree
          groups={groups}
          list={list}
          collapsed={collapsed}
          collapsedSubagents={collapsedSubagents}
          searching={searching}
          searchItems={search.items}
          searchLoading={search.loading}
          renaming={renaming}
          renameDraft={renameDraft}
          onToggleGroup={toggleGroup}
          onOpen={open}
          onWorkspaceMenu={(event, workspaceId) => { openMenu(event, { workspaceId, isWorkspace: true }) }}
          onSessionMenu={(event, sessionId) => { openMenu(event, { sessionId, isWorkspace: false }) }}
          onToggleSubagents={toggleSubagents}
          setRenameDraft={setRenameDraft}
          commitRename={(sessionId) => { void commitRename(sessionId) }}
          commitWorkspaceRename={(workspaceId) => { void commitWorkspaceRename(workspaceId) }}
          meta={meta}
          t={t}
        />
      </div>
      <BrowserMenu state={menu} onDismiss={() => { setMenu(null) }} actions={menuActions} t={t} />
    </div>
  )
}
