/**
 * 会话「更多」嵌套菜单：重命名/置顶/未读/归档，以及项目/复制/分叉/打开方式子菜单。
 * 项目归属经 Host attach/detach；跨目录项禁用并附原因。
 */

import {
  Archive, Copy, ExternalLink, Folder, GitFork, Link2, Pencil, Pin, Terminal,
} from 'lucide-react'
import type { TFn, WorkspaceViewLike } from '../faces.js'
import { MenuItem, MenuSep, Submenu } from './menu-flyout.js'
import css from '../styles.module.css'

/** 规范化路径：统一分隔符、去尾斜杠、Windows 盘符小写。 */
export function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, '/')
  if (trimmed === '') return ''
  const noTrail = trimmed.length > 1 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
  return /^[A-Za-z]:/.test(noTrail) ? `${noTrail[0]!.toLowerCase()}${noTrail.slice(1)}` : noTrail
}

/** 两路径在规范化后是否指向同一目录。 */
export function sameDirectory(left: string | undefined, right: string | undefined): boolean {
  if (left === undefined || right === undefined) return false
  const a = normalizePath(left)
  const b = normalizePath(right)
  return a !== '' && a === b
}

/** 会话菜单可执行动作（由浏览器闭包提供）。 */
export interface SessionMenuActions {
  rename(): void
  togglePin(): void
  toggleUnread(): void
  archive(): void
  moveToWorkspace(workspaceId: string): void
  moveToUngrouped(): void
  canMoveToUngrouped: boolean
  copyCwd(): void
  copyLink(): void
  copyMarkdown(): void
  markdownAvailable: boolean
  fork(): void
  openInExplorer(): void
  openInTerminal(): void
  openNewWindow(): void
  pinned: boolean
  unread: boolean
  cwd?: string | undefined
}

export interface SessionMenuProps {
  actions: SessionMenuActions
  workspaces: readonly WorkspaceViewLike[]
  currentWorkspaceId?: string | undefined
  t: TFn
}

/** 渲染会话嵌套菜单内容（不含定位外壳）。 */
export function SessionMenuBody(props: SessionMenuProps): React.ReactNode {
  const { actions, workspaces, currentWorkspaceId, t } = props
  // 仅 cwd 与工作区 path 一致、且尚未归属该工作区时可 attach。
  const movable = workspaces.filter(ws =>
    ws.workspaceId !== currentWorkspaceId && sameDirectory(actions.cwd, ws.path),
  )
  const blocked = workspaces.filter(ws =>
    ws.workspaceId !== currentWorkspaceId && !sameDirectory(actions.cwd, ws.path),
  )
  const empty = movable.length === 0 && blocked.length === 0 && !actions.canMoveToUngrouped

  return (
    <>
      <MenuItem icon={<Pencil size={13} />} label={t('rename')} onClick={actions.rename} />
      <MenuItem
        icon={<Pin size={13} />}
        label={actions.pinned ? t('unpin') : t('pin')}
        onClick={actions.togglePin}
      />
      <MenuItem
        label={actions.unread ? t('clearUnread') : t('markUnread')}
        onClick={actions.toggleUnread}
      />
      <MenuItem icon={<Archive size={13} />} label={t('archive')} onClick={actions.archive} />
      <MenuSep />
      <Submenu label={t('menuMoveProject')} icon={<Folder size={13} />} t={t}>
        {empty && (
          <MenuItem label={t('menuNoOtherProjects')} disabled disabledReason={t('menuNoOtherProjects')} />
        )}
        {actions.canMoveToUngrouped && (
          <MenuItem label={t('menuMoveToUngrouped')} onClick={actions.moveToUngrouped} />
        )}
        {movable.map(ws => (
          <MenuItem
            key={ws.workspaceId}
            label={ws.title}
            onClick={() => { actions.moveToWorkspace(ws.workspaceId) }}
          />
        ))}
        {blocked.map(ws => (
          <MenuItem
            key={ws.workspaceId}
            label={ws.title}
            disabled
            disabledReason={t('menuMovePathMismatch')}
          />
        ))}
      </Submenu>
      <Submenu label={t('menuCopy')} icon={<Copy size={13} />} t={t}>
        <MenuItem label={t('copyCwd')} onClick={actions.copyCwd} />
        <MenuItem label={t('copyLink')} icon={<Link2 size={13} />} onClick={actions.copyLink} />
        <MenuItem
          label={t('copyMarkdown')}
          disabled={!actions.markdownAvailable}
          disabledReason={t('copyMarkdownUnavailable')}
          onClick={actions.copyMarkdown}
        />
      </Submenu>
      <Submenu label={t('menuFork')} icon={<GitFork size={13} />} t={t}>
        <MenuItem label={t('forkSession')} onClick={actions.fork} />
        <MenuItem
          label={t('forkNewWorktree')}
          disabled
          disabledReason={t('needHostWorktree')}
        />
      </Submenu>
      <Submenu label={t('menuOpenWith')} icon={<ExternalLink size={13} />} t={t}>
        <MenuItem label={t('openInExplorer')} onClick={actions.openInExplorer} />
        <MenuItem
          icon={<Terminal size={13} />}
          label={t('openInTerminal')}
          onClick={actions.openInTerminal}
        />
        <MenuItem
          label={t('openInCursor')}
          disabled
          disabledReason={t('needHostCursorOpener')}
        />
        <MenuItem label={t('openInNewWindow')} onClick={actions.openNewWindow} />
      </Submenu>
      <div className={css.menuHint}>{t('menuKnownLimitsHint')}</div>
    </>
  )
}
