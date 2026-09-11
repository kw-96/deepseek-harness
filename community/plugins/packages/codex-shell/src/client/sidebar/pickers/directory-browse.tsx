/**
 * 目录浏览视图（弹窗内复用）：路径输入 + 上级/刷新 + 子目录列表。
 * 数据来自 codexShell remote 的 fsList；当前路径变化时通过 onSelect 回传。
 */

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Folder, FolderSearch } from 'lucide-react'
import type { FsListEntry, FsListResponse } from 'dsh-codex-shell/types'
import type { TFn } from '../../faces.js'
import css from '../../styles.module.css'

export interface DirectoryBrowseProps {
  fsList: (path: string) => Promise<FsListResponse>
  /** 首次挂载时列出的目录。 */
  initialPath: string
  /** 当前选中目录变化（输入、进入子目录、返回上级）时回调。 */
  onSelect: (path: string) => void
  t: TFn
}

/** 取父目录（兼容 / 与 \\ 分隔符）。 */
function parentOf(dir: string): string {
  const idx = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'))
  if (idx <= 0) return dir
  return dir.slice(0, idx)
}

/** 拼接子路径（宿主端归一化分隔符）。 */
function joinPath(parent: string, name: string): string {
  return `${parent}\\${name}`
}

/** 渲染目录浏览视图。 */
export function DirectoryBrowse({ fsList, initialPath, onSelect, t }: DirectoryBrowseProps) {
  const [path, setPath] = useState(initialPath)
  const [listing, setListing] = useState<readonly FsListEntry[]>([])
  const [listingPath, setListingPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const browse = useCallback(async (dir: string): Promise<void> => {
    if (dir.trim() === '') return
    setLoading(true)
    setError(null)
    try {
      const result = await fsList(dir.trim())
      setListing(result.entries.filter(entry => entry.kind === 'directory'))
      setListingPath(dir.trim())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [fsList])

  useEffect(() => {
    void browse(initialPath)
    // 只在挂载时列一次：后续浏览由输入与子目录点击驱动。
  }, [browse, initialPath])

  const enter = (dir: string): void => {
    setPath(dir)
    onSelect(dir)
    void browse(dir)
  }

  return (
    <>
      <div className={css.pickerRow}>
        <input
          className={css.textInput}
          placeholder={t('pickerPathPlaceholder')}
          value={path}
          onChange={event => {
            setPath(event.target.value)
            onSelect(event.target.value)
          }}
          onKeyDown={event => { if (event.key === 'Enter') void browse(path) }}
        />
        <button
          type="button"
          className={css.iconButton}
          title={t('pickerBrowse')}
          aria-label={t('pickerBrowse')}
          onClick={() => { void browse(path) }}
        >
          <FolderSearch size={14} />
        </button>
      </div>
      <div className={css.pickerRow}>
        <button
          type="button"
          className={css.iconButton}
          title={t('filesUp')}
          aria-label={t('filesUp')}
          onClick={() => { enter(parentOf(listingPath)) }}
        >
          <ArrowLeft size={14} />
        </button>
        <span className={css.rowLabel} title={listingPath}>{listingPath}</span>
      </div>
      {loading && <div className={css.empty}>{t('loading')}</div>}
      {error !== null && <div className={css.error}>{error}</div>}
      {!loading && error === null && (
        <div className={css.pickerList}>
          {listing.length === 0
            ? <div className={css.empty}>{t('filesEmpty')}</div>
            : listing.map(entry => (
              <div
                key={entry.name}
                className={css.fileRow}
                onClick={() => { enter(joinPath(listingPath, entry.name)) }}
              >
                <Folder size={14} style={{ flex: 'none', opacity: 0.7 }} />
                <span className={css.rowLabel}>{entry.name}</span>
              </div>
            ))}
        </div>
      )}
    </>
  )
}
