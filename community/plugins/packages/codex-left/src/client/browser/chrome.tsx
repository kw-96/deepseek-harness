/** 侧栏浏览器外壳：常驻搜索框与折叠轨道控件。 */

import type { RefObject } from 'react'
import { Search, X } from 'lucide-react'
import type { TFn } from '../faces.js'
import css from '../styles.module.css'

/** 搜索框：输入绑定与清除按钮。 */
export function BrowserSearchBar(props: {
  query: string
  inputRef: RefObject<HTMLInputElement>
  onQuery: (value: string) => void
  onClear: () => void
  t: TFn
}): React.ReactNode {
  const { query, inputRef, onQuery, onClear, t } = props
  return (
    <div className={css.searchBar}>
      <Search size={13} style={{ flex: 'none', opacity: 0.6 }} />
      <input
        ref={inputRef}
        className={css.search}
        type="text"
        placeholder={t('searchPlaceholder')}
        value={query}
        onChange={event => { onQuery(event.target.value) }}
        onKeyDown={event => { if (event.key === 'Escape') onClear() }}
      />
      {query !== '' && (
        <button type="button" className={css.clearButton} title={t('clearSearch')}
          aria-label={t('clearSearch')}
          onClick={onClear}>
          <X size={12} />
        </button>
      )}
    </div>
  )
}

/** 折叠轨道态：常显的搜索入口，点击后展开侧栏并聚焦搜索。 */
export function BrowserRailControls(props: { onExpand: () => void; t: TFn }): React.ReactNode {
  const { onExpand, t } = props
  return (
    <div className={css.railControls}>
      <button type="button" className={css.railButton} title={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        onClick={onExpand}>
        <Search size={18} />
      </button>
    </div>
  )
}
