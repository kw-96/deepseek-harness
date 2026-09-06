/** Git 面板顶部工具栏：分支切换、变更摘要、刷新/拉取/推送与更多菜单。 */

import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, Download, GitBranch,
  MinusCircle, MoreHorizontal, PlusCircle, RefreshCw,
} from 'lucide-react'
import type { TFn } from '../../faces.js'
import css from '../../styles.module.css'

interface GitToolbarProps {
  branch: string | null
  ahead: number
  behind: number
  changed: number
  branches: readonly string[]
  currentBranch: string | null
  busy: boolean
  onCheckout: (branch: string) => void
  onFetch: () => void
  onPull: () => void
  onPush: () => void
  onStageAll: () => void
  onUnstageAll: () => void
  onRefresh: () => void
  t: TFn
}

type MenuKind = 'branch' | 'more'

interface MenuState { kind: MenuKind; top: number; left: number }

/**
 * Git 工具栏组件。
 * @param props 分支/计数/分支列表与各操作回调
 */
export function GitToolbar(props: GitToolbarProps): React.ReactNode {
  const { t } = props
  const [menu, setMenu] = useState<MenuState | null>(null)
  const branchRef = useRef<HTMLButtonElement | null>(null)
  const moreRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (menu === null) return
    const dismiss = (event: MouseEvent): void => {
      const target = event.target as Node
      if (menuRef.current !== null && menuRef.current.contains(target)) return
      setMenu(null)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [menu])

  /** 打开锚定在触发按钮下方的下拉菜单。 */
  const openMenu = (kind: MenuKind, rect: DOMRect): void => {
    setMenu({ kind, top: rect.bottom + 6, left: Math.max(8, Math.min(rect.right - 220, window.innerWidth - 228)) })
  }

  const summary = props.changed > 0
    ? props.t('gitChangedSummary', { n: props.changed })
    : props.t('gitClean')

  return (
    <div className={css.gitToolbar}>
      <button ref={branchRef} type="button" className={css.branchButton}
        aria-haspopup="menu" aria-expanded={menu?.kind === 'branch'}
        onClick={() => { const rect = branchRef.current?.getBoundingClientRect(); if (rect !== undefined) openMenu('branch', rect) }}>
        <GitBranch size={13} style={{ flex: 'none', opacity: 0.8 }} />
        <span>{props.branch ?? '—'}</span>
        {(props.ahead > 0 || props.behind > 0) && (
          <span className={css.branchDelta}>
            {props.ahead > 0 ? `↑${props.ahead}` : ''}{props.behind > 0 ? `↓${props.behind}` : ''}
          </span>
        )}
        <ChevronDown size={11} style={{ flex: 'none', opacity: 0.7 }} />
      </button>
      <span className={css.gitSummary}>{summary}</span>
      <button type="button" className={css.iconButton} title={t('gitRefresh')} disabled={props.busy}
        onClick={props.onRefresh}>
        <RefreshCw size={13} className={props.busy ? css.spin : undefined} />
      </button>
      <button type="button" className={css.iconButton} title={t('gitPull')} disabled={props.busy}
        onClick={props.onPull}>
        <ArrowDownToLine size={14} />
      </button>
      <button type="button" className={css.iconButton} title={t('gitPush')} disabled={props.busy}
        onClick={props.onPush}>
        <ArrowUpFromLine size={14} />
      </button>
      <button ref={moreRef} type="button" className={css.iconButton} title={t('gitMoreActions')}
        aria-label={t('gitMoreActions')} aria-haspopup="menu" aria-expanded={menu?.kind === 'more'}
        onClick={() => { const rect = moreRef.current?.getBoundingClientRect(); if (rect !== undefined) openMenu('more', rect) }}>
        <MoreHorizontal size={14} />
      </button>
      {menu?.kind === 'branch' && (
        <div ref={menuRef} className={css.menu} style={{ top: menu.top, left: menu.left }}>
          <div className={css.menuCaption}>{t('gitBranchesMenu')}</div>
          {props.branches.map(name => (
            <button key={name} type="button" role="menuitem" className={css.menuItem}
              onClick={() => { setMenu(null); props.onCheckout(name) }}>
              <span className={css.menuIcon}>
                {name === props.currentBranch ? <Check size={14} /> : <GitBranch size={14} />}
              </span>
              <span className={css.menuLabel}>{name}</span>
            </button>
          ))}
        </div>
      )}
      {menu?.kind === 'more' && (
        <div ref={menuRef} className={css.menu} style={{ top: menu.top, left: menu.left }}>
          <button type="button" role="menuitem" className={css.menuItem}
            onClick={() => { setMenu(null); props.onStageAll() }}>
            <span className={css.menuIcon}><PlusCircle size={14} /></span>
            <span>{t('gitStageAll')}</span>
          </button>
          <button type="button" role="menuitem" className={css.menuItem}
            onClick={() => { setMenu(null); props.onUnstageAll() }}>
            <span className={css.menuIcon}><MinusCircle size={14} /></span>
            <span>{t('gitUnstageAll')}</span>
          </button>
          <button type="button" role="menuitem" className={css.menuItem}
            onClick={() => { setMenu(null); props.onFetch() }}>
            <span className={css.menuIcon}><Download size={14} /></span>
            <span>{t('gitFetch')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
