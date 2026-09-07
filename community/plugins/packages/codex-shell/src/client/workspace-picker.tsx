/** 添加工作区入口（sidebar.footer.action）：页脚按钮 + 居中弹窗。
 * 目录浏览基于 codexShell remote 的 fsList；原生 directoryFlow 槽声明
 * 始终由被遮蔽的原生浏览器持有，插件不能渲染它，故自带轻量选择流程。 */

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Folder, FolderPlus, FolderSearch, X } from 'lucide-react'
import type { FsListEntry, FsListResponse } from 'dsh-codex-shell/types'
import type { SelectorHook, SessionListStateLike, TFn, WorkspaceViewLike } from './faces.js'
import { registerAddWorkspaceOpener } from './sidebar/add-workspace-bus.js'
import css from './styles.module.css'

export interface AddWorkspaceInjected {
  fsList: (path: string) => Promise<FsListResponse>
  createWorkspace: (input: { path: string }) => Promise<WorkspaceViewLike>
}

export interface AddWorkspaceProps extends AddWorkspaceInjected {
  wide: boolean
  useSessions: SelectorHook<SessionListStateLike>
  t: TFn
}

/** 取父目录（兼容 / 与 \\ 分隔符）。 */
function parentOf(dir: string): string {
  const idx = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'))
  if (idx <= 0) return dir
  return dir.slice(0, idx)
}

/** 拼接子路径（与 FilesPanel 同约定，宿主端归一化分隔符）。 */
function joinPath(parent: string, name: string): string {
  return `${parent}\\${name}`
}

/** 页脚“添加工作区”按钮与居中选择弹窗。 */
export function AddWorkspaceAction({ wide, useSessions, fsList, createWorkspace, t }: AddWorkspaceProps) {
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState('')
  const [listing, setListing] = useState<readonly FsListEntry[]>([])
  const [listingPath, setListingPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const currentCwd = useSessions(s => s.current === undefined ? undefined : s.byId[s.current]?.cwd)

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

  const openModal = (): void => {
    const initial = currentCwd ?? ''
    setPath(initial)
    setListing([])
    setListingPath('')
    setError(null)
    setLoading(false)
    setBusy(false)
    setOpen(true)
    void browse(initial)
  }

  const closeModal = (): void => {
    if (busy) return
    setOpen(false)
  }

  // 标题栏「+」与页脚入口共用打开器。
  useEffect(() => {
    registerAddWorkspaceOpener(openModal)
    return () => { registerAddWorkspaceOpener(null) }
  }, [currentCwd, browse])

  // 弹窗打开时 Esc 关闭。
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  })

  // Desktop title-bar File → Open Workspace.
  useEffect(() => {
    const onCommand = (event: Event): void => {
      const detail = (event as CustomEvent<{ command?: string }>).detail
      if (detail?.command === 'add-workspace') openModal()
    }
    window.addEventListener('dsh-desktop:command', onCommand)
    return () => { window.removeEventListener('dsh-desktop:command', onCommand) }
  })

  const confirm = (): void => {
    if (path.trim() === '' || busy) return
    setBusy(true)
    createWorkspace({ path: path.trim() })
      .then(() => { setOpen(false) })
      .catch(reason => {
        setBusy(false)
        setError(reason instanceof Error ? reason.message : String(reason))
      })
  }

  const enter = (dir: string): void => {
    setPath(dir)
    void browse(dir)
  }

  return (
    <>
      {wide
        ? (
          <button type="button" className={css.footerButton} onClick={openModal}>
            <FolderPlus size={15} />
            <span>{t('addWorkspace')}</span>
          </button>
        )
        : (
          <button type="button" className={css.railButton} title={t('addWorkspace')}
            aria-label={t('addWorkspace')}
            onClick={openModal}>
            <FolderPlus size={18} />
          </button>
        )}
      {open && (
        <div className={css.backdrop} onClick={closeModal}>
          <div className={css.modal} role="dialog" aria-label={t('pickerTitle')}
            onClick={event => { event.stopPropagation() }}>
            <div className={css.pickerTitle}>{t('pickerTitle')}</div>
            <div className={css.pickerRow}>
              <input className={css.textInput} placeholder={t('pickerPathPlaceholder')} value={path}
                onChange={event => { setPath(event.target.value) }}
                onKeyDown={event => { if (event.key === 'Enter') confirm() }} />
              <button type="button" className={css.primaryButton} disabled={path.trim() === '' || busy}
                onClick={confirm}>
                {busy ? '…' : t('pickerCreate')}
              </button>
              <button type="button" className={css.iconButton} title={t('pickerCancel')} aria-label={t('pickerCancel')}
                onClick={closeModal}>
                <X size={14} />
              </button>
            </div>
            <div className={css.pickerRow}>
              <button type="button" className={css.iconButton} title={t('filesUp')} aria-label={t('filesUp')}
                onClick={() => { enter(parentOf(listingPath)) }}>
                <ArrowLeft size={14} />
              </button>
              <span className={css.rowLabel} title={listingPath}>{listingPath}</span>
              <button type="button" className={css.iconButton} title={t('pickerBrowse')} aria-label={t('pickerBrowse')}
                onClick={() => { void browse(path) }}>
                <FolderSearch size={14} />
              </button>
            </div>
            {loading && <div className={css.empty}>{t('pluginLoading')}</div>}
            {error !== null && <div className={css.error}>{error}</div>}
            {!loading && error === null && (
              <div className={css.pickerList}>
                {listing.length === 0
                  ? <div className={css.empty}>{t('filesEmpty')}</div>
                  : listing.map(entry => (
                    <div key={entry.name} className={css.fileRow}
                      onClick={() => { enter(joinPath(listingPath, entry.name)) }}>
                      <Folder size={14} style={{ flex: 'none', opacity: 0.7 }} />
                      <span className={css.rowLabel}>{entry.name}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
