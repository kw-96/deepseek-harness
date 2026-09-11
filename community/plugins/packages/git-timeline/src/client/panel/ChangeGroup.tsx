/** 变更列表里的一个分组（已暂存 / 更改），含行内差异与丢弃确认。 */

import { DiffView } from './DiffView.js'
import { entryLabel, isConflict, splitPath, statusKind, statusLetter } from '../lib/format.js'
import type { DiffState, OpenDiff } from '../controller/state.js'
import type { GitEntry } from '../../types.js'
import type { TFn } from '../lib/faces.js'
import css from './styles.module.css'

/** 状态字母的配色类。 */
function statusClass(kind: 'modified' | 'added' | 'deleted' | 'conflict'): string {
  switch (kind) {
    case 'added': return css.statusAdded ?? ''
    case 'deleted': return css.statusDeleted ?? ''
    case 'conflict': return css.statusConflict ?? ''
    default: return css.statusModified ?? ''
  }
}

export interface ChangeGroupProps {
  t: TFn
  title: string
  entries: readonly GitEntry[]
  /** 该组的行内操作：`stage` 组显示「暂存 + 丢弃」，`unstage` 组显示「取消暂存」。 */
  verb: 'stage' | 'unstage'
  confirmPath: string | null
  openDiff: OpenDiff | null
  diff: DiffState | null
  onToggle: (entry: GitEntry) => void
  onToggleAll: () => void
  onDiscard: (entry: GitEntry) => void
  onOpenDiff: (entry: GitEntry, staged: boolean) => void
  onCloseDiff: () => void
}

/**
 * 单个变更分组。
 * @param props 分组标题、条目与该组的回调
 */
export function ChangeGroup(props: ChangeGroupProps): React.ReactNode {
  const { t, title, entries, verb, confirmPath, openDiff, diff } = props
  const staged = verb === 'unstage'
  const toggleTitle = verb === 'stage' ? t('stage') : t('unstage')
  return (
    <section className={css.group}>
      <div className={css.groupHead}>
        <span className={css.groupTitle}>{title}<span className={css.groupCount}>{entries.length}</span></span>
        <button type="button" className={css.groupAction} title={verb === 'stage' ? t('stageAll') : t('unstageAll')}
          aria-label={verb === 'stage' ? t('stageAll') : t('unstageAll')} onClick={props.onToggleAll}>
          {verb === 'stage' ? t('stageAll') : t('unstageAll')}
        </button>
      </div>
      {entries.map(entry => {
        const { name, dir } = splitPath(entryLabel(entry))
        const open = openDiff !== null && openDiff.path === entry.path && openDiff.staged === staged
        const conflict = isConflict(entry.xy)
        return (
          <div key={`${verb}:${entry.path}`}>
            <div className={open ? `${css.fileRow} ${css.fileRowOpen}` : css.fileRow}>
              <button type="button" className={css.fileMain} title={open ? t('closeDiff') : t('openDiff')}
                aria-label={`${t('openDiff')} ${entry.path}`}
                onClick={() => { open ? props.onCloseDiff() : props.onOpenDiff(entry, staged) }}>
                <span className={statusClass(statusKind(entry.xy))} title={conflict ? t('conflict') : undefined}>
                  {statusLetter(entry.xy)}
                </span>
                <span className={css.fileName}>{name}</span>
                {dir !== '' && <span className={css.fileDir}>{dir}</span>}
              </button>
              {confirmPath === entry.path
                ? (
                  <button type="button" className={css.fileConfirm} title={t('discardConfirm')}
                    aria-label={`${t('discardConfirm')} ${entry.path}`} onClick={() => { props.onDiscard(entry) }}>
                    {t('discardConfirm')}
                  </button>
                )
                : (
                  <>
                    {/* 未跟踪文件不给丢弃入口：`git restore` 不覆盖它们，删除又过于危险。 */}
                    {verb === 'stage' && entry.xy !== '??' && (
                      <button type="button" className={css.fileAction} title={t('discard')}
                        aria-label={`${t('discard')} ${entry.path}`} onClick={() => { props.onDiscard(entry) }}>
                        ⟲
                      </button>
                    )}
                    <button type="button" className={css.fileAction} title={toggleTitle}
                      aria-label={`${toggleTitle} ${entry.path}`} onClick={() => { props.onToggle(entry) }}>
                      {verb === 'stage' ? '+' : '−'}
                    </button>
                  </>
                )}
            </div>
            {open && diff !== null && (
              <DiffView t={t} path={entry.path} scope={staged ? 'staged' : 'worktree'} state={diff}
                onClose={props.onCloseDiff} />
            )}
          </div>
        )
      })}
    </section>
  )
}
