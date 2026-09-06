/** 侧栏树体：Codex 式安静排布 —— 细字工作区标题、单行会话、未分组/
 * 归档区与搜索结果态。纯渲染层，状态与动作全部来自 WorkspaceBrowser。 */

import { Archive, Folder, FolderOpen, Inbox, MoreHorizontal } from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import type { SearchResultLike, SessionId, SessionListStateLike, TFn, WorkspaceViewLike } from './faces.js'
import { SessionRow } from './session-rows.js'
import css from './styles.module.css'

/** 分组投影结果（浏览器 useMemo 产出）。 */
export interface GroupsModel {
  grouped: { workspace: WorkspaceViewLike; sessions: SessionId[] }[]
  ungrouped: SessionId[]
  archived: SessionId[]
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
  onToggleGroup: (key: string) => void
  onOpen: (sessionId: SessionId) => void
  onWorkspaceMenu: (event: React.MouseEvent, workspaceId: string) => void
  onSessionMenu: (event: React.MouseEvent, sessionId: SessionId) => void
  onToggleSubagents: (key: string) => void
  setRenameDraft: (value: string) => void
  commitRename: (sessionId: SessionId) => void
  commitWorkspaceRename: (workspaceId: string) => void
  meta: SessionMetaStore
  t: TFn
}

/** 渲染树体：搜索态、空态与分组树。 */
export function BrowserTree(props: BrowserTreeProps): React.ReactNode {
  const {
    groups, list, collapsed, collapsedSubagents, searching, searchItems, searchLoading, renaming,
    renameDraft, onToggleGroup, onOpen, onWorkspaceMenu, onSessionMenu, onToggleSubagents,
    setRenameDraft, commitRename, commitWorkspaceRename, meta, t,
  } = props

  const now = Date.now()

  /** 本地化相对时间（悬停显露）。 */
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

  const sessionRow = (sessionId: SessionId, archived = false) => {
    const summary = list.byId[sessionId]
    if (summary === undefined) return null
    const subagents = list.ids.flatMap(id => {
      const child = list.byId[id]
      if (child === undefined || child.parentId !== sessionId || child.origin !== 'subagent' || child.blank) return []
      return [{ id, title: child.displayTitle, current: list.current === id, running: child.running }]
    })
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
      meta={meta}
      open={onOpen}
      t={t}
    />
  }

  const renderGroup = (
    key: string,
    label: string,
    rows: React.ReactNode,
    kind: 'workspace' | 'ungrouped' | 'archived',
    workspaceId?: string,
  ): React.ReactNode => {
    const isCollapsed = collapsed.has(key)
    const renameKey = workspaceId === undefined ? undefined : `ws:${workspaceId}`
    const renamingWorkspace = renameKey !== undefined && renaming === renameKey
    // 名称前的图标表示分组本身：工作区=文件夹（展开开/收起合），归档=归档盒。
    const groupIcon = kind === 'archived'
      ? <Archive size={13} className={css.workspaceIcon} />
      : isCollapsed
        ? <Folder size={13} className={css.workspaceIcon} />
        : <FolderOpen size={13} className={css.workspaceIcon} />
    return (
      <div key={key} className={css.workspaceGroup}>
        <div className={css.workspaceHead} role="treeitem" aria-expanded={!isCollapsed}
          onClick={() => { onToggleGroup(key) }}>
          {groupIcon}
          {renamingWorkspace
            ? <input
              className={css.search}
              autoFocus
              value={renameDraft}
              onChange={event => { setRenameDraft(event.target.value) }}
              onBlur={() => { commitWorkspaceRename(workspaceId as string) }}
              onKeyDown={event => { if (event.key === 'Enter') commitWorkspaceRename(workspaceId as string) }}
              onClick={event => event.stopPropagation()}
            />
            : <span className={css.workspaceLabel}>{label}</span>}
          {workspaceId !== undefined && !renamingWorkspace && (
            <span className={css.workspaceActions}>
              <button type="button" className={css.iconButton} title={t('moreActions')}
                aria-label={t('moreActions')}
                onClick={event => { event.stopPropagation(); onWorkspaceMenu(event, workspaceId) }}>
                <MoreHorizontal size={13} />
              </button>
            </span>
          )}
        </div>
        {!isCollapsed && rows}
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

  return (
    <>
      {groups.grouped.length === 0 && groups.ungrouped.length === 0 && groups.archived.length === 0 && (
        <div className={css.emptyWrap}>
          <Inbox size={22} />
          <span className={css.emptyTitle}>{t('sidebarEmptyTitle')}</span>
          <span>{t('sidebarEmptyHint')}</span>
        </div>
      )}
      {groups.grouped.map(({ workspace, sessions }) => renderGroup(
        `ws:${workspace.workspaceId}`, workspace.title, sessions.map(id => sessionRow(id)), 'workspace', workspace.workspaceId,
      ))}
      {groups.ungrouped.length > 0 && renderGroup(
        'ungrouped', t('ungrouped'), groups.ungrouped.map(id => sessionRow(id)), 'ungrouped',
      )}
      {groups.archived.length > 0 && renderGroup(
        'archived', t('archived'), groups.archived.map(id => sessionRow(id, true)), 'archived',
      )}
    </>
  )
}
