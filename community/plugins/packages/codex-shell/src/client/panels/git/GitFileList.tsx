/** Git 面板的已暂存/更改分组列表：状态徽标 + 悬停显隐操作。 */

import { Minus, Plus, Undo2 } from 'lucide-react'
import type { TFn } from '../../faces.js'
import { displayPath, isUntracked, statusLetter, type GitEntryLike } from './support.js'
import css from '../../styles.module.css'

/** 状态字母到样式类的映射。 */
const STATUS_CLASS: Record<string, string | undefined> = {
  M: css.statusModified, A: css.statusAdded, D: css.statusDeleted, R: css.statusRenamed,
  C: css.statusRenamed, U: css.statusUnmerged, '?': css.statusUntracked, '!': css.statusUntracked,
}

interface GitFileListProps {
  staged: readonly GitEntryLike[]
  changes: readonly GitEntryLike[]
  clean: boolean
  onShowDiff: (path: string, staged: boolean) => void
  onStage: (path: string) => void
  onUnstage: (path: string) => void
  onDiscard: (path: string) => void
  t: TFn
}

/**
 * 文件分组列表组件。
 * @param props 分组条目与各行操作回调
 */
export function GitFileList(props: GitFileListProps): React.ReactNode {
  /** 渲染一条文件行：状态徽标 + 路径 + 悬停显隐操作。 */
  const renderFile = (entry: GitEntryLike, isStaged: boolean): React.ReactNode => {
    const letter = statusLetter(entry, isStaged)
    return (
      <div key={`${isStaged ? 's' : 'u'}:${entry.path}`} className={css.fileRow}
        onClick={() => { props.onShowDiff(entry.path, isStaged) }}>
        <span className={STATUS_CLASS[letter] ?? css.statusBlank} aria-hidden="true">{letter === ' ' ? '' : letter}</span>
        <span className={css.gitFilePath}>{displayPath(entry)}</span>
        <span className={css.rowMeta}>
          {isStaged ? (
            <button type="button" className={`${css.iconButton} ${css.reveal}`} title={props.t('gitUnstage')}
              onClick={event => { event.stopPropagation(); props.onUnstage(entry.path) }}>
              <Minus size={13} />
            </button>
          ) : (
            <>
              <button type="button" className={`${css.iconButton} ${css.reveal}`} title={props.t('gitStage')}
                onClick={event => { event.stopPropagation(); props.onStage(entry.path) }}>
                <Plus size={13} />
              </button>
              {!isUntracked(entry) && (
                <button type="button" className={`${css.iconButton} ${css.reveal}`} title={props.t('gitDiscard')}
                  onClick={event => {
                    event.stopPropagation()
                    if (window.confirm(props.t('gitDiscardConfirm'))) props.onDiscard(entry.path)
                  }}>
                  <Undo2 size={13} />
                </button>
              )}
            </>
          )}
        </span>
      </div>
    )
  }

  return (
    <>
      {props.staged.length > 0 && (
        <>
          <div className={css.groupHead}>
            <span>{props.t('gitStaged')}</span>
            <span className={css.count}>{props.staged.length}</span>
          </div>
          {props.staged.map(entry => renderFile(entry, true))}
        </>
      )}
      {props.changes.length > 0 && (
        <>
          <div className={css.groupHead}>
            <span>{props.t('gitChanges')}</span>
            <span className={css.count}>{props.changes.length}</span>
          </div>
          {props.changes.map(entry => renderFile(entry, false))}
        </>
      )}
      {props.clean && <div className={css.empty}>{props.t('gitClean')}</div>}
    </>
  )
}
