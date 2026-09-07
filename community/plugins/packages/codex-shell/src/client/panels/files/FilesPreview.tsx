/** 文件面板底部文本预览与保存。 */

import { ArrowLeft, ChevronDown, Save } from 'lucide-react'
import type { TFn } from '../../faces.js'
import css from '../../styles.module.css'

export interface FilesPreviewState {
  path: string | null
  kind: 'missing' | 'binary' | 'text'
  content: string
  truncated: boolean
  dirty: boolean
  saving: boolean
}

export interface FilesPreviewProps {
  preview: FilesPreviewState
  onChange: (next: FilesPreviewState) => void
  onSave: () => void
  onClose: () => void
  t: TFn
}

function displayName(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx < 0 ? path : path.slice(idx + 1)
}

/**
 * 文件预览区。
 * @param props 预览状态与保存/关闭回调
 */
export function FilesPreview({ preview, onChange, onSave, onClose, t }: FilesPreviewProps): React.ReactNode {
  if (preview.path === null) return null
  return (
    <div className={css.filesPreview}>
      <div className={css.header} style={{ borderBottom: 'none' }}>
        <ArrowLeft size={13} />
        <span className={css.rowLabel}>{displayName(preview.path)}</span>
        <button type="button" className={css.iconButton} title={t('panelFiles')} onClick={onClose}>
          <ChevronDown size={13} />
        </button>
      </div>
      {preview.kind === 'binary' ? <div className={css.empty}>{t('filesBinary')}</div>
        : preview.kind === 'missing' ? <div className={css.empty}>{t('filesMissing')}</div>
          : (
            <>
              <textarea className={css.code}
                style={{ resize: 'none', border: 'none', background: 'transparent', color: 'inherit', outline: 'none', flex: 1 }}
                value={preview.content} spellCheck={false}
                onChange={event => { onChange({ ...preview, content: event.target.value, dirty: true }) }} />
              <div className={css.inputRow}>
                {preview.truncated && <span className={css.note}>{t('filesTruncated')}</span>}
                <button type="button" className={css.primaryButton} disabled={!preview.dirty || preview.saving} onClick={onSave}>
                  <Save size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {preview.saving ? '…' : t('filesSave')}
                </button>
              </div>
            </>
          )}
    </div>
  )
}
