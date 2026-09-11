/**
 * 「新建项目」居中弹窗：项目名 + 基本盘工作区。
 * 基本盘可以是已有工作区（单选），也可以直接选一个目录——目录会先
 * 创建/复用一个工作区，再作为项目的首个工作树（root）。
 */

import { useEffect, useState } from 'react'
import { Folder, FolderSearch, X } from 'lucide-react'
import type { FsListResponse, ProjectView } from 'dsh-codex-shell/types'
import type { TFn, WorkspaceViewLike } from '../../faces.js'
import { DirectoryBrowse } from '../pickers/directory-browse.js'
import css from '../../styles.module.css'

export interface ProjectCreateProps {
  open: boolean
  workspaces: readonly WorkspaceViewLike[]
  fsList: (path: string) => Promise<FsListResponse>
  /** 创建或复用工作区（幂等）。 */
  createWorkspace: (input: { path: string }) => Promise<{ workspaceId: string; path: string }>
  createProject: (name: string, roots?: readonly string[]) => Promise<{ project: ProjectView }>
  onCreated: () => void
  onClose: () => void
  t: TFn
}

/** 取路径最后一段作为默认项目名。 */
function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/u, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return idx === -1 ? trimmed : trimmed.slice(idx + 1)
}

/** 渲染新建项目弹窗；关闭时返回 null。 */
export function ProjectCreateModal(props: ProjectCreateProps) {
  const { open, workspaces, fsList, createWorkspace, createProject, onCreated, onClose, t } = props
  const [name, setName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined)
  const [pickingDir, setPickingDir] = useState(false)
  const [dirPath, setDirPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 每次打开重置；默认选中第一个工作区作为基本盘。
  useEffect(() => {
    if (!open) return
    setName('')
    setNameEdited(false)
    setPickingDir(false)
    setDirPath('')
    setBusy(false)
    setError(null)
    setWorkspaceId(workspaces[0]?.workspaceId)
  }, [open, workspaces])

  const selectedWorkspace = workspaces.find(ws => ws.workspaceId === workspaceId)
  const basePath = pickingDir ? dirPath : selectedWorkspace?.path
  const effectiveName = nameEdited ? name : basename(basePath ?? '')

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [busy, onClose, open])

  if (!open) return null

  const confirm = async (): Promise<void> => {
    const trimmed = effectiveName.trim()
    const path = basePath?.trim() ?? ''
    if (trimmed === '' || path === '' || busy) return
    setBusy(true)
    setError(null)
    try {
      const workspace = await createWorkspace({ path })
      await createProject(trimmed, [workspace.path])
      onCreated()
      onClose()
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <div className={css.backdrop} onClick={() => { if (!busy) onClose() }}>
      <div className={css.modal} role="dialog" aria-label={t('newProjectTitle')}
        onClick={event => { event.stopPropagation() }}>
        <div className={css.pickerTitle}>{t('newProjectTitle')}</div>
        <div className={css.pickerRow}>
          <input
            className={css.textInput}
            placeholder={t('newProjectName')}
            value={effectiveName}
            onChange={event => { setName(event.target.value); setNameEdited(true) }}
            onKeyDown={event => { if (event.key === 'Enter') void confirm() }}
          />
          <button
            type="button"
            className={css.primaryButton}
            disabled={busy || (basePath?.trim() ?? '') === '' || effectiveName.trim() === ''}
            onClick={() => { void confirm() }}
          >
            {busy ? '…' : t('newProjectConfirm')}
          </button>
          <button
            type="button"
            className={css.iconButton}
            title={t('pickerCancel')}
            aria-label={t('pickerCancel')}
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
        <div className={css.menuGroupLabel}>{t('newProjectBaseLabel')}</div>
        {!pickingDir && (
          <div className={css.pickerList}>
            {workspaces.length === 0
              ? <div className={css.empty}>{t('newProjectNoWorkspace')}</div>
              : workspaces.map(ws => (
                <div
                  key={ws.workspaceId}
                  className={`${css.fileRow} ${ws.workspaceId === workspaceId ? css.fileRowActive : ''}`}
                  onClick={() => { setWorkspaceId(ws.workspaceId); setPickingDir(false) }}
                >
                  <Folder size={14} style={{ flex: 'none', opacity: 0.7 }} />
                  <span className={css.rowLabel} title={ws.path}>{ws.title}</span>
                </div>
              ))}
          </div>
        )}
        {!pickingDir && (
          <div className={css.pickerRow}>
            <button
              type="button"
              className={css.iconButton}
              title={t('newProjectPickDir')}
              aria-label={t('newProjectPickDir')}
              onClick={() => { setPickingDir(true) }}
            >
              <FolderSearch size={14} />
            </button>
            <span className={css.rowLabel}>{t('newProjectPickDir')}</span>
          </div>
        )}
        {pickingDir && (
          <>
            <DirectoryBrowse
              fsList={fsList}
              initialPath={dirPath}
              onSelect={setDirPath}
              t={t}
            />
            <div className={css.pickerRow}>
              <button
                type="button"
                className={css.secondaryButton}
                onClick={() => { setPickingDir(false) }}
              >
                {t('newProjectBackToWorkspaces')}
              </button>
            </div>
          </>
        )}
        {error !== null && <div className={css.error}>{error}</div>}
      </div>
    </div>
  )
}
