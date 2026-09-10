/** 内联差异视图：路径头 + 逐行着色的 unified diff 文本。 */

import { FileDiff, X } from 'lucide-react'
import type { TFn } from '../../faces.js'
import { parseDiff, type DiffLineKind } from './support.js'
import css from '../../styles.module.css'

/** 单次渲染的差异行上限，防止超长 diff 卡顿渲染。 */
const MAX_DIFF_LINES = 2000

interface DiffViewProps {
  path: string
  text: string
  onClose: () => void
  t: TFn
}

/** 行类别到样式类的映射。 */
const LINE_CLASS: Record<DiffLineKind, string | undefined> = {
  add: css.diffAdd,
  del: css.diffDel,
  meta: css.diffMeta,
  hunk: css.diffHunk,
  context: css.diffContext,
}

/**
 * 差异视图组件。
 * @param path 展示在头部的文件路径
 * @param text diff 原始文本
 * @param onClose 关闭回调
 * @param t 文案函数
 */
export function DiffView({ path, text, onClose, t }: DiffViewProps): React.ReactNode {
  const lines = parseDiff(text)
  const truncated = lines.length > MAX_DIFF_LINES
  return (
    <div className={css.diffWrap}>
      <div className={css.diffHeader}>
        <FileDiff size={13} style={{ flex: 'none', opacity: 0.7 }} />
        <span className={css.diffPath}>{path}</span>
        <button type="button" className={css.iconButton} title={t('gitCloseDiff')}
          aria-label={t('gitCloseDiff')}
          onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <div className={css.diffBody}>
        {lines.slice(0, MAX_DIFF_LINES).map((line, index) => (
          <div key={index} className={LINE_CLASS[line.kind]}>{line.text === '' ? ' ' : line.text}</div>
        ))}
        {truncated && <div className={css.diffNote}>{t('gitDiffTruncated')}</div>}
      </div>
    </div>
  )
}
