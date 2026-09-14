/** Git 面板底部栏（固定）：分支切换、网络通道状态、刷新、工作区名与 Git 账号（可配置）。 */

import { useState } from 'react'
import { Check, GitBranch, Globe, Loader2, Plus, RefreshCw, User } from 'lucide-react'
import type { GitChannelStatus, GitIdentity } from '../../types.js'
import type { TFn } from '../lib/faces.js'
import css from './styles.module.css'

export interface BottomBarProps {
  t: TFn
  branch: string | null
  ahead: number
  behind: number
  identity: GitIdentity | null
  /** 网络通道状态；未探测完成时为 null。 */
  channel: GitChannelStatus | null
  /** 是否正在探测通道或切换远程。 */
  probing: boolean
  /** 是否正在切换远程地址。 */
  switching: boolean
  onReprobe: () => void
  onUseSsh: () => void
  workspaceName: string
  busy: boolean
  branchNames: readonly string[]
  branchMenuOpen: boolean
  onToggleBranchMenu: () => void
  onCheckout: (branch: string) => void
  onCreateBranch: (name: string) => void
  onSaveIdentity: (name: string, email: string, scope: 'global' | 'local') => void
  onRefresh: () => void
}

/**
 * 面板底部状态条。
 * @param props 分支/身份/通道状态与各入口回调
 */
export function BottomBar(props: BottomBarProps): React.ReactNode {
  const { t, branch, ahead, behind, identity, channel, probing, switching, workspaceName, busy, branchNames, branchMenuOpen } = props
  const [draft, setDraft] = useState('')
  const [accountOpen, setAccountOpen] = useState(false)
  const [name, setName] = useState(identity?.name ?? '')
  const [email, setEmail] = useState(identity?.email ?? '')
  const [scope, setScope] = useState<'global' | 'local'>('global')
  const configured = identity !== null && (identity.name !== null || identity.email !== null)
  // 只显示用户名：邮箱会把底部栏挤满，需要时在悬停说明与账号弹层里看。
  const accountName = identity?.name ?? identity?.email ?? null
  const account = configured && accountName !== null ? accountName : t('accountUnset')
  // 通道提示按「是否已就绪」两态呈现；被阻断时给出改用 SSH 的动作。
  const channelOk = channel !== null && channel.advice === 'ok'
  const channelText = channel === null ? t('net') : channelOk ? t('netReady') : t('netBlocked')
  const channelTitle = probing ? t('netProbing') : `${t('net')}：${channel?.note ?? t('netProbing')}`

  /** 回车即新建并切换分支；名称为空时忽略。 */
  const submitBranch = (): void => {
    const trimmed = draft.trim()
    if (trimmed === '') return
    setDraft('')
    props.onCreateBranch(trimmed)
  }

  /** 打开配置弹层：用当前生效值预填两个输入框。 */
  const toggleAccount = (): void => {
    if (!accountOpen) {
      setName(identity?.name ?? '')
      setEmail(identity?.email ?? '')
    }
    setAccountOpen(open => !open)
  }

  const save = (): void => {
    if (name.trim() === '' || email.trim() === '') return
    setAccountOpen(false)
    props.onSaveIdentity(name.trim(), email.trim(), scope)
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
      <button type="button" className={channelOk ? `${css.netButton} ${css.netReady}` : css.netButton}
        title={channelTitle} aria-label={t('netProbe')} disabled={probing} onClick={props.onReprobe}>
        <Globe size={12} aria-hidden="true" />
        <span className={css.netText}>{channelText}</span>
        {probing && <Loader2 size={11} className={css.spinning} aria-hidden="true" />}
      </button>
      {channel?.advice === 'use-ssh' && (
        <button type="button" className={css.netFixButton} title={t('netUseSshHint')}
          aria-label={t('netUseSsh')} disabled={probing} onClick={props.onUseSsh}>
          {switching ? t('netSwitching') : t('netUseSsh')}
        </button>
      )}
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
        <span className={css.bottomText}>{workspaceName}</span>
      </span>
      <button type="button" className={configured ? css.accountButton : `${css.accountButton} ${css.accountUnset}`}
        title={configured && identity?.email != null
          ? `${identity.name ?? identity.email} <${identity.email}>${identity.origin === null ? '' : ` · ${identity.origin}`}`
          : t('accountHint')}
        aria-label={t('accountMenu')} aria-haspopup="dialog" aria-expanded={accountOpen}
        onClick={toggleAccount}>
        <User size={12} aria-hidden="true" />
        <span className={css.bottomText}>{account}</span>
      </button>
      {accountOpen && (
        <div className={css.accountMenu} role="dialog" aria-label={t('accountMenu')}>
          <div className={css.branchMenuHead}>{t('accountMenu')}</div>
          <div className={css.accountOrigin}>
            {configured
              ? (identity.origin === null ? t('accountOriginUnknown') : t('accountOrigin', { path: identity.origin }))
              : t('accountHint')}
          </div>
          <label className={css.accountField}>
            <span>{t('accountName')}</span>
            <input className={css.branchInput} value={name} placeholder="kw-96"
              aria-label={t('accountName')}
              onChange={(event) => { setName(event.target.value) }} />
          </label>
          <label className={css.accountField}>
            <span>{t('accountEmail')}</span>
            <input className={css.branchInput} value={email} placeholder="you@example.com"
              aria-label={t('accountEmail')}
              onChange={(event) => { setEmail(event.target.value) }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); save() } }} />
          </label>
          <div className={css.accountScope}>
            {(['global', 'local'] as const).map(candidate => (
              <button key={candidate} type="button"
                className={scope === candidate ? `${css.scopeOption} ${css.scopeOptionOn}` : css.scopeOption}
                aria-pressed={scope === candidate}
                onClick={() => { setScope(candidate) }}>
                {candidate === 'global' ? t('accountScopeGlobal') : t('accountScopeLocal')}
              </button>
            ))}
          </div>
          <button type="button" className={css.accountSave}
            disabled={name.trim() === '' || email.trim() === ''} onClick={save}>
            {t('accountSave')}
          </button>
        </div>
      )}
    </div>
  )
}
