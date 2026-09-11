/** 行内差异视图：变更列表里展开当前文件的差异（工作区 / 索引侧 / 某条提交）。 */

import { X } from 'lucide-react'
import { parseDiffLines } from '../lib/diff.js'
import type { DiffState } from '../controller/state.js'
import type { TFn } from '../lib/faces.js'
import css from './styles.module.css'

/** 差异的作用域：决定头部显示的侧别标签。 */
export type DiffScope = 'staged' | 'worktree' | 'commit'

export interface DiffViewProps {
  t: TFn
  path: string
  scope: DiffScope
  state: DiffState
  onClose: () => void
}

/** 作用域 → 文案键。 */
function scopeLabelKey(scope: DiffScope): 'diffStaged' | 'diffWorktree' | 'diffCommit' {
  if (scope === 'staged') return 'diffStaged'
  if (scope === 'commit') return 'diffCommit'
  return 'diffWorktree'
}

/** 差异行类别 → 样式类。 */
function lineClass(kind: string): string {
  switch (kind) {
    case 'add': return css.diffAdd ?? ''
    case 'del': return css.diffDel ?? ''
    case 'hunk': return css.diffHunk ?? ''
    case 'meta': return css.diffMeta ?? ''
    default: return css.diffContext ?? ''
  }
}

/**
 * 差异视图（嵌在列表内，不占新区域）。
 * @param props 目标文件、作用域、差异状态与关闭回调
 */
export function DiffView({ t, path, scope, state, onClose }: DiffViewProps): React.ReactNode {
  const lines = state.status === 'ready' ? parseDiffLines(state.text) : []
  return (
    <div className={css.diff} data-path={path}>
      <div className={css.diffHead}>
        <span className={css.diffScope}>{t(scopeLabelKey(scope))}</span>
        <span className={css.diffPath} title={path}>{path}</span>
        <button type="button" className={css.diffClose} title={t('closeDiff')} aria-label={t('closeDiff')} onClick={onClose}>
          <X size={12} />
        </button>
      </div>
      <div className={css.diffBody}>
        {state.status === 'loading' && <div className={css.note}>{t('loading')}</div>}
        {state.status === 'error' && <div className={css.error}>{state.error}</div>}
        {state.status === 'ready' && (lines.length === 0
          ? <div className={css.note}>{t('diffEmpty')}</div>
          : lines.map((line, index) => (
            <div key={`${String(index)}`} className={lineClass(line.kind)}>
              {line.text === '' ? ' ' : line.text}
            </div>
          )))}
        {state.status === 'ready' && state.truncated && <div className={css.note}>{t('diffTruncated')}</div>}
      </div>
    </div>
  )
}
