/**
 * 侧栏「项目」标题栏：标题 + 整理/排序菜单（…）+ 新建项目（+）。
 * 「添加工作区…」保留在整理菜单里（顶层入口让给新建项目）。
 */

import { MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import type { TFn } from '../faces.js'
import type { OrganizeMode, SortMode } from './prefs.js'
import { MenuItem, MenuSep } from './menu-flyout.js'
import css from '../styles.module.css'

export interface SectionHeaderProps {
  organize: OrganizeMode
  sort: SortMode
  /** 自动归档阈值（天）；0 表示关闭。 */
  autoArchiveDays: number
  onOrganize: (mode: OrganizeMode) => void
  onSort: (mode: SortMode) => void
  onAutoArchive: (days: number) => void
  onAddWorkspace: () => void
  onNewProject: () => void
  t: TFn
}

/** 自动归档的可选阈值（天）；0 为关闭。 */
const AUTO_ARCHIVE_CHOICES: readonly number[] = [0, 7, 14, 30, 90]

/** 项目区段标题栏。 */
export function SectionHeader(props: SectionHeaderProps): React.ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <div className={css.sectionHeader}>
      <span className={css.sectionTitle}>{props.t('projectsSection')}</span>
      <span className={css.sectionActions}>
        <button
          type="button"
          className={css.iconButton}
          title={props.t('organizeSidebar')}
          aria-label={props.t('organizeSidebar')}
          aria-expanded={open}
          onClick={event => {
            event.stopPropagation()
            setOpen(prev => !prev)
          }}
        >
          <MoreHorizontal size={14} />
        </button>
        <button
          type="button"
          className={css.iconButton}
          title={props.t('addProject')}
          aria-label={props.t('addProject')}
          onClick={event => {
            event.stopPropagation()
            props.onNewProject()
          }}
        >
          <Plus size={14} />
        </button>
      </span>
      {open && (
        <div
          className={css.sectionMenu}
          role="menu"
          onMouseLeave={() => { setOpen(false) }}
        >
          <div className={css.menuGroupLabel}>{props.t('organizeSidebar')}</div>
          <MenuItem
            label={props.t('organizeByProject')}
            trailing={props.organize === 'byProject' ? '✓' : undefined}
            onClick={() => { props.onOrganize('byProject'); setOpen(false) }}
          />
          <MenuItem
            label={props.t('organizeFlat')}
            trailing={props.organize === 'flat' ? '✓' : undefined}
            onClick={() => { props.onOrganize('flat'); setOpen(false) }}
          />
          <MenuSep />
          <div className={css.menuGroupLabel}>{props.t('chatSort')}</div>
          <MenuItem
            label={props.t('sortPinnedFirst')}
            trailing={props.sort === 'pinnedFirst' ? '✓' : undefined}
            onClick={() => { props.onSort('pinnedFirst'); setOpen(false) }}
          />
          <MenuItem
            label={props.t('sortRecent')}
            trailing={props.sort === 'recent' ? '✓' : undefined}
            onClick={() => { props.onSort('recent'); setOpen(false) }}
          />
          <MenuItem
            label={props.t('sortManual')}
            trailing={props.sort === 'manual' ? '✓' : undefined}
            onClick={() => { props.onSort('manual'); setOpen(false) }}
          />
          <MenuSep />
          <div className={css.menuGroupLabel}>{props.t('autoArchiveLabel')}</div>
          {AUTO_ARCHIVE_CHOICES.map(days => (
            <MenuItem
              key={days}
              label={days === 0 ? props.t('autoArchiveOff') : props.t('autoArchiveDays', { n: days })}
              trailing={props.autoArchiveDays === days ? '✓' : undefined}
              onClick={() => { props.onAutoArchive(days); setOpen(false) }}
            />
          ))}
          <MenuSep />
          <MenuItem
            label={props.t('addWorkspace')}
            onClick={() => { props.onAddWorkspace(); setOpen(false) }}
          />
        </div>
      )}
    </div>
  )
}
