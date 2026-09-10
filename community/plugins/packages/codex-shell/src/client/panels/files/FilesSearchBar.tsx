/** 文件面板搜索栏：收起快搜 / 展开 VS Code 风格高级选项。 */

import { CaseSensitive, ChevronDown, ChevronRight, Replace, WholeWord } from 'lucide-react'
import type { TFn } from '../../faces.js'
import type { FilesSearchForm } from './useFilesSearch.js'
import css from '../../styles.module.css'

export interface FilesSearchBarProps {
  form: FilesSearchForm
  onChange: (next: FilesSearchForm) => void
  onReplaceAll: () => void
  replaceBusy: boolean
  t: TFn
}

/**
 * 文件搜索表单。
 * @param props 表单状态与回调
 */
export function FilesSearchBar({ form, onChange, onReplaceAll, replaceBusy, t }: FilesSearchBarProps): React.ReactNode {
  const set = (patch: Partial<FilesSearchForm>): void => { onChange({ ...form, ...patch }) }
  const replaceDisabled = form.useRegex || form.query.trim() === ''

  return (
    <div className={css.filesSearchBox}>
      <div className={css.filesSearchRow}>
        <button type="button" className={css.iconButton}
          aria-label={form.expanded ? t('filesSearchCollapse') : t('filesSearchExpand')}
          aria-expanded={form.expanded}
          onClick={() => { set({ expanded: !form.expanded }) }}>
          {form.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <input className={css.filesSearchInput} placeholder={t('filesSearchPlaceholder')}
          aria-label={t('filesSearchLabel')} value={form.query}
          onChange={event => { set({ query: event.target.value }) }} />
        <Toggle label="Aa" title={t('filesMatchCase')} on={form.matchCase}
          onClick={() => { set({ matchCase: !form.matchCase }) }} />
        <Toggle label="ab" title={t('filesMatchWord')} on={form.matchWholeWord}
          onClick={() => { set({ matchWholeWord: !form.matchWholeWord }) }} />
        <Toggle label=".*" title={t('filesUseRegex')} on={form.useRegex}
          onClick={() => { set({ useRegex: !form.useRegex }) }} />
      </div>
      {form.expanded && (
        <>
          <div className={css.filesSearchRow}>
            <span style={{ width: 28, flex: 'none' }} />
            <input className={css.filesSearchInput} placeholder={t('filesReplacePlaceholder')}
              aria-label={t('filesReplaceLabel')} value={form.replace}
              onChange={event => { set({ replace: event.target.value }) }} />
            <button type="button" className={css.iconButton} disabled={replaceDisabled || replaceBusy}
              title={form.useRegex ? t('filesReplaceDisabled') : t('filesReplaceAll')}
              aria-label={t('filesReplaceAll')} onClick={onReplaceAll}>
              <Replace size={14} />
            </button>
          </div>
          <div className={css.filesFieldLabel}>{t('filesIncludeLabel')}</div>
          <div className={css.filesSearchRow}>
            <input className={css.filesSearchInput} placeholder={t('filesIncludePlaceholder')}
              aria-label={t('filesIncludeLabel')} value={form.include}
              onChange={event => { set({ include: event.target.value }) }} />
          </div>
          <div className={css.filesFieldLabel}>{t('filesExcludeLabel')}</div>
          <div className={css.filesSearchRow}>
            <input className={css.filesSearchInput} placeholder={t('filesExcludePlaceholder')}
              aria-label={t('filesExcludeLabel')} value={form.exclude}
              onChange={event => { set({ exclude: event.target.value }) }} />
          </div>
        </>
      )}
    </div>
  )
}

interface ToggleProps {
  label: string
  title: string
  on: boolean
  onClick: () => void
}

/** 搜索开关按钮。 */
function Toggle({ label, title, on, onClick }: ToggleProps): React.ReactNode {
  return (
    <button type="button" className={on ? css.filesToggleOn : css.filesToggle}
      title={title} aria-label={title} aria-pressed={on} onClick={onClick}>
      {label === 'Aa' ? <CaseSensitive size={13} /> : label === 'ab' ? <WholeWord size={13} /> : label}
    </button>
  )
}
