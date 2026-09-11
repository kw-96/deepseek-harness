/** Changes 区：提交信息框（含模型生成）、提交方式按钮组、变更分组列表。 */

import { useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { ChangeGroup } from './ChangeGroup.js'
import type { GitEntry, GitStatusResponse } from '../../types.js'
import type { CommitAction, DiffState, OpenDiff } from '../controller/state.js'
import { COMMIT_ACTIONS, actionLabelKey } from '../controller/state.js'
import type { TFn } from '../lib/faces.js'
import css from './styles.module.css'

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
  onDiscard: (entry: GitEntry) => void
  onStageAll: () => void
  onUnstageAll: () => void
  openDiff: OpenDiff | null
  diff: DiffState | null
  onOpenDiff: (entry: GitEntry, staged: boolean) => void
  onCloseDiff: () => void
}

/**
 * Changes 区。
 * @param props 状态、提交信息与全部回调
 */
export function Changes(props: ChangesProps): React.ReactNode {
  const { t, status, message, onMessage, generating, onGenerate, action, onAction, busy, onCommit } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmPath, setConfirmPath] = useState<string | null>(null)
  const staged = status?.staged ?? []
  const changes = status?.changes ?? []
  const empty = staged.length === 0 && changes.length === 0

  /** 丢弃是破坏性操作：第一次点击进入确认态，第二次才执行。 */
  const requestDiscard = (entry: GitEntry): void => {
    if (confirmPath !== entry.path) { setConfirmPath(entry.path); return }
    setConfirmPath(null)
    props.onDiscard(entry)
  }

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
                <ChangeGroup t={t} title={t('staged')} entries={staged} verb="unstage" confirmPath={confirmPath}
                  openDiff={props.openDiff} diff={props.diff}
                  onToggle={props.onUnstage} onToggleAll={props.onUnstageAll} onDiscard={requestDiscard}
                  onOpenDiff={props.onOpenDiff} onCloseDiff={props.onCloseDiff} />
              )}
              {changes.length > 0 && (
                <ChangeGroup t={t} title={t('changes')} entries={changes} verb="stage" confirmPath={confirmPath}
                  openDiff={props.openDiff} diff={props.diff}
                  onToggle={props.onStage} onToggleAll={props.onStageAll} onDiscard={requestDiscard}
                  onOpenDiff={props.onOpenDiff} onCloseDiff={props.onCloseDiff} />
              )}
            </>
          )}
      </div>
    </div>
  )
}
