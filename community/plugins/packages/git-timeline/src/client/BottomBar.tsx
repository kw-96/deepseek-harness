/** Git 面板底部栏（固定）：分支、刷新、工作区名与 git 账号。 */

import { GitBranch, RefreshCw, User } from 'lucide-react'
import type { GitIdentity } from '../types.js'
import type { TFn } from './faces.js'
import css from './styles.module.css'

export interface BottomBarProps {
  t: TFn
  branch: string | null
  ahead: number
  behind: number
  identity: GitIdentity | null
  workspaceName: string
  busy: boolean
  onRefresh: () => void
}

/**
 * 面板底部状态条。
 * @param props 分支/身份信息与刷新回调
 */
export function BottomBar({ t, branch, ahead, behind, identity, workspaceName, busy, onRefresh }: BottomBarProps): React.ReactNode {
  const account = identity === null || (identity.name === null && identity.email === null)
    ? t('accountUnknown')
    : [identity.name, identity.email].filter(part => part !== null && part !== '').join(' · ')
  return (
    <div className={css.bottomBar}>
      <span className={css.bottomItem} title={t('branch')}>
        <GitBranch size={12} aria-hidden="true" />
        <span className={css.bottomStrong}>{branch ?? t('detached')}</span>
        {ahead > 0 && <span className={css.bottomDelta}>↑{ahead}</span>}
        {behind > 0 && <span className={css.bottomDelta}>↓{behind}</span>}
      </span>
      <button type="button" className={css.bottomButton} title={t('refresh')} aria-label={t('refresh')}
        disabled={busy} onClick={onRefresh}>
        <RefreshCw size={12} className={busy ? css.spinning : undefined} />
      </button>
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
