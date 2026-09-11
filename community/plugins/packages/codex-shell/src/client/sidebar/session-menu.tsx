/**
 * 会话「更多」嵌套菜单：重命名/置顶/未读/归档，以及项目/复制/分叉/打开方式子菜单。
 * 项目归属经 Host attach/detach；归并目标只列**项目**，由浏览器解析到项目下的工作区。
 */

import {
  Archive, Copy, ExternalLink, Folder, GitFork, Link2, Pencil, Pin, Terminal,
} from 'lucide-react'
import type { ProjectView, TFn } from '../faces.js'
import { MenuItem, MenuSep, Submenu } from './menu-flyout.js'
import css from '../styles.module.css'

/** 会话菜单可执行动作（由浏览器闭包提供）。 */
export interface SessionMenuActions {
  rename(): void
  togglePin(): void
  toggleUnread(): void
  archive(): void
  moveToProject(projectId: string): void
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
  projects: readonly ProjectView[]
  currentProjectId?: string | undefined
  t: TFn
}

/** 渲染会话嵌套菜单内容（不含定位外壳）。 */
export function SessionMenuBody(props: SessionMenuProps): React.ReactNode {
  const { actions, projects, currentProjectId, t } = props
  // 归并目标＝除当前所属项目之外的所有项目；项目下没有工作区时由浏览器以会话目录补建。
  const targets = projects.filter(project => project.projectId !== currentProjectId)
  const empty = targets.length === 0 && !actions.canMoveToUngrouped

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
        {targets.map(project => (
          <MenuItem
            key={project.projectId}
            label={project.name}
            onClick={() => { actions.moveToProject(project.projectId) }}
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
