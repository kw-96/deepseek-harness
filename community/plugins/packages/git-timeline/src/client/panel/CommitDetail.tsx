/** 提交详情：Graph 列表里展开一条提交的元信息、改动文件与单文件差异。 */

import { X } from 'lucide-react'
import { DiffView } from './DiffView.js'
import { statusKind, statusLetter } from '../lib/format.js'
import type { CommitDetailState, DiffState, OpenCommitFile } from '../controller/state.js'
import type { TFn } from '../lib/faces.js'
import css from './styles.module.css'

export interface CommitDetailProps {
  t: TFn
  hash: string
  state: CommitDetailState
  openFile: OpenCommitFile | null
  fileDiff: DiffState | null
  onToggleFile: (hash: string, path: string) => void
  onClose: () => void
}

/** 单字母状态 → 面板复用的 XY 形态（A./D./M.）。 */
function statusXY(status: string): string {
  const letter = status.slice(0, 1).toUpperCase()
  if (letter === 'A' || letter === 'D') return `${letter}.`
  return 'M.'
}

/** 状态字母的配色类。 */
function statusClass(status: string): string {
  switch (statusKind(statusXY(status))) {
    case 'added': return css.statusAdded ?? ''
    case 'deleted': return css.statusDeleted ?? ''
    default: return css.statusModified ?? ''
  }
}

/**
 * 提交详情视图（嵌在 Graph 列表中）。
 * @param props 目标提交、详情状态、展开的文件差异与关闭回调
 */
export function CommitDetail(props: CommitDetailProps): React.ReactNode {
  const { t, hash, state, openFile, fileDiff } = props
  const commit = state.detail?.commit ?? null
  const files = state.detail?.files ?? []
  return (
    <div className={css.detail} data-commit={hash}>
      <div className={css.detailHead}>
        <span className={css.detailHash}>{commit?.shortHash ?? hash.slice(0, 7)}</span>
        {commit !== null && <span className={css.detailAuthor}>{commit.author} · {commit.date}</span>}
        <button type="button" className={css.diffClose} title={t('closeDetail')} aria-label={t('closeDetail')} onClick={props.onClose}>
          <X size={12} />
        </button>
      </div>
      {commit !== null && commit.parents.length > 1 && (
        <div className={css.detailMeta}>{t('parents', { n: commit.parents.length })}</div>
      )}
      {state.status === 'loading' && <div className={css.note}>{t('loading')}</div>}
      {state.status === 'error' && <div className={css.error}>{state.error}</div>}
      {state.status === 'ready' && (
        <div className={css.detailFiles}>
          <div className={css.detailFilesHead}>{t('commitFiles', { n: files.length })}</div>
          {files.length === 0
            ? <div className={css.note}>{t('commitFilesEmpty')}</div>
            : files.map(file => {
              const name = file.path.split('/').at(-1) ?? file.path
              const open = openFile !== null && openFile.hash === hash && openFile.path === file.path
              return (
                <div key={`${file.status}:${file.path}`}>
                  <button type="button" className={css.detailFileButton} title={file.path}
                    aria-label={`${t('openDiff')} ${file.path}`}
                    onClick={() => { props.onToggleFile(hash, file.path) }}>
                    <span className={statusClass(file.status)}>{statusLetter(statusXY(file.status))}</span>
                    <span className={css.fileName}>{name}</span>
                    <span className={css.fileDir}>
                      {file.origPath === null ? '' : `${file.origPath} → `}
                      {file.path.slice(0, Math.max(0, file.path.length - name.length))}
                    </span>
                  </button>
                  {open && fileDiff !== null && (
                    <DiffView t={t} path={file.path} scope="commit" state={fileDiff}
                      onClose={() => { props.onToggleFile(hash, file.path) }} />
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
