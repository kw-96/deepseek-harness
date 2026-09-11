/**
 * 「管理工作树」弹窗：编辑项目的目录 roots（工作树）。
 * 每个 root 对应一个目录；目录已注册为工作区时额外标注，未注册的目录
 * 会在会话归并/新建时按需补建工作区。
 */

import { useEffect, useState } from 'react'
import { FolderPlus, Trash2, X } from 'lucide-react'
import type { FsListResponse, ProjectView } from 'dsh-codex-shell/types'
import type { TFn, WorkspaceViewLike } from '../../faces.js'
import { DirectoryBrowse } from '../pickers/directory-browse.js'
import { pathKey } from '../groups.js'
import css from '../../styles.module.css'

export interface ProjectWorktreesProps {
  /** 要管理的项目；null 表示关闭。 */
  project: ProjectView | null
  workspaces: readonly WorkspaceViewLike[]
  fsList: (path: string) => Promise<FsListResponse>
  onSave: (projectId: string, roots: readonly string[]) => Promise<void>
  onClose: () => void
  t: TFn
}

/** 渲染工作树管理弹窗；未选中项目时返回 null。 */
export function ProjectWorktreesModal(props: ProjectWorktreesProps) {
  const { project, workspaces, fsList, onSave, onClose, t } = props
  const [roots, setRoots] = useState<readonly string[]>(project?.roots ?? [])
  const [adding, setAdding] = useState(false)
  const [draftPath, setDraftPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (project === null) return
    setRoots(project.roots)
    setAdding(false)
    setDraftPath('')
    setBusy(false)
    setError(null)
  }, [project])

  useEffect(() => {
    if (project === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [busy, onClose, project])

  if (project === null) return null

  const registered = (root: string): boolean =>
    workspaces.some(ws => pathKey(ws.path) === pathKey(root))

  const append = (path: string): void => {
    const trimmed = path.trim()
    if (trimmed === '') return
    setRoots(current => current.some(root => pathKey(root) === pathKey(trimmed))
      ? current
      : [...current, trimmed])
    setAdding(false)
    setDraftPath('')
  }

  const save = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onSave(project.projectId, roots)
      onClose()
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <div className={css.backdrop} onClick={() => { if (!busy) onClose() }}>
      <div className={css.modal} role="dialog" aria-label={t('worktreesTitle')}
        onClick={event => { event.stopPropagation() }}>
        <div className={css.pickerTitle}>{t('worktreesTitle')}</div>
        <div className={css.menuGroupLabel}>{project.name}</div>
        <div className={css.pickerList}>
          {roots.length === 0
            ? <div className={css.empty}>{t('worktreesEmpty')}</div>
            : roots.map(root => (
              <div key={root} className={css.fileRow}>
                <span className={css.rowLabel} title={root}>{root}</span>
                <span className={css.menuHint}>
                  {registered(root) ? t('worktreesRegistered') : t('worktreesUnregistered')}
                </span>
                <button
                  type="button"
                  className={css.iconButton}
                  title={t('worktreesRemove')}
                  aria-label={t('worktreesRemove')}
                  onClick={() => { setRoots(current => current.filter(item => item !== root)) }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
        </div>
        {adding
          ? (
            <>
              <DirectoryBrowse fsList={fsList} initialPath={draftPath} onSelect={setDraftPath} t={t} />
              <div className={css.pickerRow}>
                <button
                  type="button"
                  className={css.primaryButton}
                  disabled={draftPath.trim() === ''}
                  onClick={() => { append(draftPath) }}
                >
                  {t('worktreesAddConfirm')}
                </button>
                <button type="button" className={css.secondaryButton} onClick={() => { setAdding(false) }}>
                  {t('pickerCancel')}
                </button>
              </div>
            </>
          )
          : (
            <div className={css.pickerRow}>
              <button
                type="button"
                className={css.iconButton}
                title={t('worktreesAdd')}
                aria-label={t('worktreesAdd')}
                onClick={() => { setAdding(true) }}
              >
                <FolderPlus size={14} />
              </button>
              <span className={css.rowLabel}>{t('worktreesAdd')}</span>
            </div>
          )}
        {error !== null && <div className={css.error}>{error}</div>}
        {!adding && (
          <div className={css.pickerRow}>
            <button
              type="button"
              className={css.primaryButton}
              disabled={busy}
              onClick={() => { void save() }}
            >
              {busy ? '…' : t('worktreesSave')}
            </button>
            <button type="button" className={css.iconButton} title={t('pickerCancel')}
              aria-label={t('pickerCancel')} onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
