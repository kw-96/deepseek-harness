/** Git 面板底部栏（固定）：分支切换、刷新、工作区名与 git 账号。 */

import { useState } from 'react'
import { Check, GitBranch, Plus, RefreshCw, User } from 'lucide-react'
import type { GitIdentity } from '../../types.js'
import type { TFn } from '../lib/faces.js'
import css from './styles.module.css'

export interface BottomBarProps {
  t: TFn
  branch: string | null
  ahead: number
  behind: number
  identity: GitIdentity | null
  workspaceName: string
  busy: boolean
  branchNames: readonly string[]
  branchMenuOpen: boolean
  onToggleBranchMenu: () => void
  onCheckout: (branch: string) => void
  onCreateBranch: (name: string) => void
  onRefresh: () => void
}

/**
 * 面板底部状态条。
 * @param props 分支/身份信息与刷新、切换分支回调
 */
export function BottomBar(props: BottomBarProps): React.ReactNode {
  const { t, branch, ahead, behind, identity, workspaceName, busy, branchNames, branchMenuOpen } = props
  const [draft, setDraft] = useState('')
  const account = identity === null || (identity.name === null && identity.email === null)
    ? t('accountUnknown')
    : [identity.name, identity.email].filter(part => part !== null && part !== '').join(' · ')

  /** 回车即新建并切换分支；名称为空时忽略。 */
  const submitBranch = (): void => {
    const name = draft.trim()
    if (name === '') return
    setDraft('')
    props.onCreateBranch(name)
  }

  return (
    <div className={css.bottomBar}>
      <button type="button" className={css.branchButton} title={t('branchMenu')} aria-label={t('branchMenu')}
        aria-haspopup="menu" aria-expanded={branchMenuOpen} disabled={busy} onClick={props.onToggleBranchMenu}>
        <GitBranch size={12} aria-hidden="true" />
        <span className={css.bottomStrong}>{branch ?? t('detached')}</span>
        {ahead > 0 && <span className={css.bottomDelta}>↑{ahead}</span>}
        {behind > 0 && <span className={css.bottomDelta}>↓{behind}</span>}
      </button>
      <button type="button" className={css.bottomButton} title={t('refresh')} aria-label={t('refresh')}
        disabled={busy} onClick={props.onRefresh}>
        <RefreshCw size={12} className={busy ? css.spinning : undefined} />
      </button>
      {branchMenuOpen && (
        <div className={css.branchMenu} role="menu">
          <div className={css.branchMenuHead}>{t('branchMenu')}</div>
          {branchNames.length === 0
            ? <div className={css.note}>{t('branchesEmpty')}</div>
            : branchNames.map(name => (
              <button key={name} type="button" role="menuitem" className={css.menuItem}
                onClick={() => { props.onCheckout(name) }}>
                {name === branch
                  ? <Check size={12} aria-hidden="true" />
                  : <span className={css.menuItemSpacer} />}
                <span className={css.branchName}>{name}</span>
              </button>
            ))}
          <div className={css.branchCreate}>
            <Plus size={12} aria-hidden="true" />
            <input className={css.branchInput} value={draft} placeholder={t('newBranchPlaceholder')}
              aria-label={t('newBranchPlaceholder')}
              onChange={(event) => { setDraft(event.target.value) }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitBranch() } }} />
            <button type="button" className={css.branchCreateButton} disabled={draft.trim() === ''}
              onClick={submitBranch}>
              {t('newBranch')}
            </button>
          </div>
        </div>
      )}
      <span className={css.bottomSpacer} />
      <span className={css.bottomItem} title={workspaceName}>
        <span className={css.bottomLabel}>{t('workspace')}</span>
        <span className={css.bottomText}>{workspaceName}</span>
      </span>
      <span className={css.bottomItem} title={account}>
        <User size={12} aria-hidden="true" />
        <span className={css.bottomText}>{account}</span>
      </span>
    </div>
  )
}
