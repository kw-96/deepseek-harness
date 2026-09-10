/** 文件搜索结果列表：文件名命中与内容命中分组展示。 */

import { File, Folder } from 'lucide-react'
import type { TFn } from '../../faces.js'
import type { FilesSearchState } from './useFilesSearch.js'
import css from '../../styles.module.css'

export interface FilesSearchResultsProps {
  search: FilesSearchState
  root: string
  onOpen: (path: string, isDir: boolean) => void
  t: TFn
  replaceLabel: string | null
}

/**
 * 将相对路径解析为绝对路径（内容搜索常返回仓内相对路径）。
 * @param root 工作区根
 * @param path 命中路径
 */
export function resolveHitPath(root: string, path: string): string {
  if (path.includes(':') || path.startsWith('/') || path.startsWith('\\')) return path
  const sep = root.includes('/') && !root.includes('\\') ? '/' : '\\'
  return `${root}${sep}${path.replaceAll('/', sep).replaceAll('\\', sep)}`
}

/**
 * 搜索结果面板。
 * @param props 搜索状态与打开回调
 */
export function FilesSearchResults({
  search, root, onOpen, t, replaceLabel,
}: FilesSearchResultsProps): React.ReactNode {
  if (search.status === 'loading') return <div className={css.note} style={{ padding: '10px 12px' }}>{t('filesSearching')}</div>
  if (search.status === 'error' && search.error !== null) return <div className={css.error}>{search.error}</div>
  if (search.status === 'idle') return null

  const empty = search.nameMatches.length === 0 && search.contentMatches.length === 0
  return (
    <>
      {replaceLabel !== null && <div className={css.note} style={{ padding: '6px 12px' }}>{replaceLabel}</div>}
      {empty
        ? <div className={css.emptyWrap}><File size={20} /><span>{t('filesSearchEmpty')}</span></div>
        : (
          <>
            {search.nameMatches.length > 0 && (
              <>
                <div className={css.filesResultGroup}>{t('filesNameResults')}</div>
                {search.nameMatches.map(item => (
                  <div key={`n:${item.path}`} className={css.filesResultRow}
                    onClick={() => { onOpen(item.path, item.isDir) }}>
                    {item.isDir
                      ? <Folder size={14} style={{ flex: 'none', opacity: 0.7, marginTop: 2 }} />
                      : <File size={14} style={{ flex: 'none', opacity: 0.7, marginTop: 2 }} />}
                    <div className={css.filesResultMeta}>
                      <span className={css.filesResultPath}>{item.path}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
            {search.contentMatches.length > 0 && (
              <>
                <div className={css.filesResultGroup}>{t('filesContentResults')}</div>
                {search.contentMatches.map((item, index) => (
                  <div key={`c:${item.path}:${item.line}:${index}`} className={css.filesResultRow}
                    onClick={() => { onOpen(resolveHitPath(root, item.path), false) }}>
                    <File size={14} style={{ flex: 'none', opacity: 0.7, marginTop: 2 }} />
                    <div className={css.filesResultMeta}>
                      <span className={css.filesResultPath}>{item.path}:{item.line}</span>
                      <span className={css.filesResultSnippet}>{item.content}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
            {search.truncated && <div className={css.note} style={{ padding: '6px 12px' }}>…</div>}
          </>
        )}
    </>
  )
}
