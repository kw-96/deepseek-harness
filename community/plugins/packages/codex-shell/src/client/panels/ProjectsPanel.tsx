/** Additional-directory project management tab (dsh-codex-project parity). */

import { useCallback, useEffect, useState } from 'react'
import { FolderPlus, File, Folder, Trash2 } from 'lucide-react'
import type { CodexApi } from '../RightPanel.js'
import type { FsListEntry } from 'dsh-codex-shell/types'
import type { TFn } from '../faces.js'
import css from '../styles.module.css'

interface ProjectsPanelProps {
  api: CodexApi
  t: TFn
  workspaceId?: string | undefined
  workspacePath?: string | undefined
}

interface DirState {
  path: string
  entries: readonly FsListEntry[]
  error: string | null
}

export function ProjectsPanel({ api, t, workspaceId, workspacePath }: ProjectsPanelProps) {
  const [dirs, setDirs] = useState<readonly string[]>([])
  const [draft, setDraft] = useState('')
  const [rejected, setRejected] = useState<string | null>(null)
  const [openDir, setOpenDir] = useState<DirState | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (workspaceId === undefined) return
    try {
      const result = await api.projectDirs(workspaceId)
      setDirs(result.dirs)
    } catch {
      setDirs([])
    }
  }, [api, workspaceId])

  useEffect(() => { void load() }, [load])

  const add = async (): Promise<void> => {
    if (workspaceId === undefined || draft.trim() === '') return
    try {
      const result = await api.projectAddDir(workspaceId, draft)
      setDirs(result.dirs)
      setRejected(result.rejected)
      if (result.rejected === null) setDraft('')
    } catch (error) {
      setRejected(error instanceof Error ? error.message : String(error))
    }
  }

  const remove = async (path: string): Promise<void> => {
    if (workspaceId === undefined) return
    const next = dirs.filter(dir => dir !== path)
    setDirs(next)
    try {
      const result = await api.projectSetDirs(workspaceId, next)
      setDirs(result.dirs)
    } catch {
      void load()
    }
  }

  const browse = async (path: string): Promise<void> => {
    try {
      const result = await api.fsList(path)
      setOpenDir({ path, entries: result.entries, error: null })
    } catch (error) {
      setOpenDir({ path, entries: [], error: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <>
      <div className={css.inputRow}>
        <input className={css.textInput} placeholder={t('projectDirPlaceholder')} value={draft}
          onChange={event => { setDraft(event.target.value); setRejected(null) }}
          onKeyDown={event => { if (event.key === 'Enter') void add() }} />
        <button type="button" className={css.primaryButton} onClick={() => { void add() }}>
          <FolderPlus size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
          {t('addProjectDir')}
        </button>
      </div>
      {rejected !== null && <div className={css.error}>{rejected}</div>}
      <div className={css.scroll}>
        {workspacePath !== undefined && (
          <div className={css.group}>
            <div className={css.groupHead}>{t('workspaceFolder')}</div>
            <div className={css.fileRow} onClick={() => { void browse(workspacePath) }}>
              <Folder size={13} style={{ flex: 'none', opacity: 0.7 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workspacePath}</span>
            </div>
          </div>
        )}
        <div className={css.group}>
          <div className={css.groupHead}>{t('projectDirs')} ({dirs.length})</div>
          {dirs.length === 0 && <div className={css.empty}>{t('summaryEmpty')}</div>}
          {dirs.map(dir => (
            <div key={dir} className={css.fileRow}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                onClick={() => { void browse(dir) }}>{dir}</span>
              <button type="button" className={css.iconButton} onClick={() => { void remove(dir) }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        {openDir !== null && (
          <div className={css.group}>
            <div className={css.groupHead}>{openDir.path}</div>
            {openDir.error !== null
              ? <div className={css.error}>{openDir.error}</div>
              : openDir.entries.map(entry => (
                <div key={entry.name} className={css.fileRow}
                  onClick={() => { if (entry.kind === 'directory') void browse(`${openDir.path}\\${entry.name}`) }}>
                  {entry.kind === 'directory' ? <Folder size={13} style={{ flex: 'none', opacity: 0.7 }} /> : <File size={13} style={{ flex: 'none', opacity: 0.7 }} />}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  )
}
