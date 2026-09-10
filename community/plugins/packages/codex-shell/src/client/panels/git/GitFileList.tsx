/** Git 面板的变更分组列表：可折叠状态组、紧凑路径与悬停操作。 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, File, FileMinus2, FilePlus2, Minus, Plus, Undo2 } from 'lucide-react'
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
  const [stagedOpen, setStagedOpen] = useState(true)
  const [changesOpen, setChangesOpen] = useState(true)

  /** 渲染一条文件行：文件名、目录、状态与悬停显隐操作。 */
  const renderFile = (entry: GitEntryLike, isStaged: boolean): React.ReactNode => {
    const letter = statusLetter(entry, isStaged)
    const path = displayPath(entry)
    const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    const name = separator < 0 ? path : path.slice(separator + 1)
    const directory = separator < 0 ? '' : path.slice(0, separator + 1)
    const FileIcon = letter === 'A' || letter === '?' ? FilePlus2 : letter === 'D' ? FileMinus2 : File
    return (
      <div key={`${isStaged ? 's' : 'u'}:${entry.path}`} className={css.gitFileRow}
        onClick={() => { props.onShowDiff(entry.path, isStaged) }}>
        <FileIcon size={14} className={css.gitFileIcon} aria-hidden="true" />
        <span className={css.gitFileMain}>
          <span className={css.gitFileName}>{name}</span>
          {directory !== '' && <span className={css.gitFileDirectory}>{directory}</span>}
        </span>
        <span className={`${STATUS_CLASS[letter] ?? css.statusBlank} ${css.gitFileState}`} aria-label={letter}>
          {letter === ' ' ? '' : letter}
        </span>
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

  /** 渲染一组可折叠的 Git 变更。 */
  const renderGroup = (
    label: string,
    entries: readonly GitEntryLike[],
    isStaged: boolean,
    open: boolean,
    setOpen: (open: boolean) => void,
  ): React.ReactNode => entries.length === 0 ? null : (
    <section className={css.gitChangeGroup}>
      <button type="button" className={css.gitChangeHead} aria-expanded={open}
        onClick={() => { setOpen(!open) }}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span>{label}</span>
        <span className={css.gitChangeCount}>{entries.length}</span>
      </button>
      {open && entries.map(entry => renderFile(entry, isStaged))}
    </section>
  )

  return (
    <section className={css.gitChangesRoot}>
      <div className={css.gitChangesTitle}>{props.t('gitChanges')}</div>
      {renderGroup(props.t('gitStaged'), props.staged, true, stagedOpen, setStagedOpen)}
      {renderGroup(props.t('gitChanges'), props.changes, false, changesOpen, setChangesOpen)}
      {props.clean && <div className={css.empty}>{props.t('gitClean')}</div>}
    </section>
  )
}
