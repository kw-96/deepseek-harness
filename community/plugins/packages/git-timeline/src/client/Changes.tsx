/** Changes 区：提交信息框（含模型生成）、提交方式按钮组、变更文件列表。 */

import { useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import type { GitEntry, GitStatusResponse } from '../types.js'
import { entryLabel, splitPath, statusKind, statusLetter } from './format.js'
import type { TFn } from './faces.js'
import css from './styles.module.css'

/** 提交按钮当前绑定的动作。 */
export type CommitAction = 'commit' | 'amend' | 'commitPush' | 'commitSync'

export const COMMIT_ACTIONS: readonly CommitAction[] = ['commit', 'amend', 'commitPush', 'commitSync']

/** 动作 → 文案键。 */
export function actionLabelKey(action: CommitAction): 'commit' | 'commitAmend' | 'commitPush' | 'commitSync' {
  switch (action) {
    case 'amend': return 'commitAmend'
    case 'commitPush': return 'commitPush'
    case 'commitSync': return 'commitSync'
    default: return 'commit'
  }
}

export interface ChangesProps {
  t: TFn
  status: GitStatusResponse | null
  message: string
  onMessage: (value: string) => void
  generating: boolean
  onGenerate: () => void
  action: CommitAction
  onAction: (action: CommitAction) => void
  busy: boolean
  onCommit: () => void
  onStage: (entry: GitEntry) => void
  onUnstage: (entry: GitEntry) => void
  onStageAll: () => void
  onUnstageAll: () => void
}

/** 一个变更分组（已暂存 / 更改）。 */
function Group({ t, title, entries, verb, onToggle, onToggleAll }: {
  t: TFn
  title: string
  entries: readonly GitEntry[]
  verb: 'stage' | 'unstage'
  onToggle: (entry: GitEntry) => void
  onToggleAll: () => void
}): React.ReactNode {
  const label = verb === 'stage' ? t('stage') : t('unstage')
  return (
    <section className={css.group}>
      <div className={css.groupHead}>
        <span className={css.groupTitle}>{title}<span className={css.groupCount}>{entries.length}</span></span>
        <button type="button" className={css.groupAction} title={verb === 'stage' ? t('stageAll') : t('unstageAll')}
          aria-label={verb === 'stage' ? t('stageAll') : t('unstageAll')} onClick={onToggleAll}>
          {verb === 'stage' ? t('stageAll') : t('unstageAll')}
        </button>
      </div>
      {entries.map(entry => {
        const { name, dir } = splitPath(entryLabel(entry))
        return (
          <div key={`${verb}:${entry.path}`} className={css.fileRow} title={entry.path}>
            <span className={statusClass(statusKind(entry.xy))}>
              {statusLetter(entry.xy)}
            </span>
            <span className={css.fileName}>{name}</span>
            {dir !== '' && <span className={css.fileDir}>{dir}</span>}
            <button type="button" className={css.fileAction} title={label} aria-label={`${label} ${entry.path}`}
              onClick={() => { onToggle(entry) }}>
              {verb === 'stage' ? '+' : '−'}
            </button>
          </div>
        )
      })}
    </section>
  )
}

/** 状态字母的配色类。 */
function statusClass(kind: 'modified' | 'added' | 'deleted'): string {
  switch (kind) {
    case 'added': return css.statusAdded ?? ''
    case 'deleted': return css.statusDeleted ?? ''
    default: return css.statusModified ?? ''
  }
}

/**
 * Changes 区。
 * @param props 状态、提交信息与全部回调
 */
export function Changes(props: ChangesProps): React.ReactNode {
  const { t, status, message, onMessage, generating, onGenerate, action, onAction, busy, onCommit } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const staged = status?.staged ?? []
  const changes = status?.changes ?? []
  const empty = staged.length === 0 && changes.length === 0
  return (
    <div className={css.changes}>
      <div className={css.messageBox}>
        <textarea className={css.messageInput} value={message} rows={3}
          placeholder={t('messagePlaceholder')} aria-label={t('messagePlaceholder')}
          onChange={(event) => { onMessage(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onCommit() } }} />
        <button type="button" className={css.generateButton} title={t('generate')} aria-label={t('generate')}
          disabled={generating || busy} onClick={onGenerate}>
          <Sparkles size={13} className={generating ? css.spinning : undefined} />
        </button>
      </div>
      <div className={css.commitRow}>
        <button type="button" className={css.commitButton} disabled={busy} onClick={onCommit}>
          {t(actionLabelKey(action))}
        </button>
        <button type="button" className={css.commitCaret} title={t('commitMenu')} aria-label={t('commitMenu')}
          aria-haspopup="menu" aria-expanded={menuOpen} disabled={busy}
          onClick={() => { setMenuOpen(open => !open) }}>
          <ChevronDown size={13} />
        </button>
        {menuOpen && (
          <div className={css.menu} role="menu">
            {COMMIT_ACTIONS.map(candidate => (
              <button key={candidate} type="button" role="menuitem" className={css.menuItem}
                onClick={() => { setMenuOpen(false); onAction(candidate) }}>
                {t(actionLabelKey(candidate))}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={css.fileScroll}>
        {empty
          ? <div className={css.empty}>{t('clean')}</div>
          : (
            <>
              {staged.length > 0 && (
                <Group t={t} title={t('staged')} entries={staged} verb="unstage"
                  onToggle={props.onUnstage} onToggleAll={props.onUnstageAll} />
              )}
              {changes.length > 0 && (
                <Group t={t} title={t('changes')} entries={changes} verb="stage"
                  onToggle={props.onStage} onToggleAll={props.onStageAll} />
              )}
            </>
          )}
      </div>
    </div>
  )
}
