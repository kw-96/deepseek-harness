/**
 * 侧栏「项目」标题栏：标题 + 整理/排序菜单（…）+ 添加工作区（+）。
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
  onOrganize: (mode: OrganizeMode) => void
  onSort: (mode: SortMode) => void
  onAddWorkspace: () => void
  t: TFn
}

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
          title={props.t('addWorkspace')}
          aria-label={props.t('addWorkspace')}
          onClick={event => {
            event.stopPropagation()
            props.onAddWorkspace()
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
        </div>
      )}
    </div>
  )
}
