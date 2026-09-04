/** File tree + text preview + save, rooted at the session workspace. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Save, Search, ArrowLeft } from 'lucide-react'
import type { CodexApi } from '../RightPanel.js'
import type { FsListEntry } from 'dsh-codex-shell/types'
import type { SessionMetaStore } from '../session-meta.js'
import type { SessionId, TFn } from '../faces.js'
import css from '../styles.module.css'

interface FilesPanelProps {
  api: CodexApi
  t: TFn
  cwd?: string | undefined
  workspaceTitle: string
  sessionId?: SessionId | undefined
  meta: SessionMetaStore
}

interface DirState {
  entries: readonly FsListEntry[]
  truncated: boolean
  error: string | null
}

interface PreviewState {
  path: string | null
  kind: 'missing' | 'binary' | 'text'
  content: string
  truncated: boolean
  dirty: boolean
  saving: boolean
}

function parentOf(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (idx <= 0) return path
  return path.slice(0, idx)
}

function displayName(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx < 0 ? path : path.slice(idx + 1)
}

export function FilesPanel({ api, t, cwd, workspaceTitle, sessionId, meta }: FilesPanelProps) {
  const [root, setRoot] = useState<string>(cwd ?? '')
  const [dir, setDir] = useState<DirState>({ entries: [], truncated: false, error: null })
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [preview, setPreview] = useState<PreviewState>({ path: null, kind: 'text', content: '', truncated: false, dirty: false, saving: false })
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (cwd !== undefined && root === '') setRoot(cwd)
  }, [cwd, root])

  const loadDir = useCallback(async (path: string): Promise<void> => {
    setDir({ entries: [], truncated: false, error: null })
    try {
      const result = await api.fsList(path)
      setDir({ entries: result.entries, truncated: result.truncated, error: null })
    } catch (error) {
      setDir({ entries: [], truncated: false, error: error instanceof Error ? error.message : String(error) })
    }
  }, [api])

  useEffect(() => {
    if (root === '') return
    void loadDir(root)
  }, [root, loadDir])

  const openPath = async (path: string, isDir: boolean): Promise<void> => {
    if (isDir) {
      await loadDir(path)
      setExpanded(prev => {
        const next = new Set(prev)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      })
      return
    }
    try {
      const result = await api.fsRead(path, 512 * 1024)
      setPreview({ path, kind: result.kind, content: result.content, truncated: result.truncated, dirty: false, saving: false })
    } catch (error) {
      setPreview({ path, kind: 'missing', content: '', truncated: false, dirty: false, saving: false })
    }
  }

  const savePreview = async (): Promise<void> => {
    if (preview.path === null) return
    setPreview(prev => ({ ...prev, saving: true }))
    try {
      await api.fsWrite(preview.path, preview.content)
      setPreview(prev => ({ ...prev, dirty: false, saving: false }))
    } catch {
      setPreview(prev => ({ ...prev, saving: false }))
    }
  }

  const crumbs = useMemo(() => {
    const parts = root.split(/[\\/]/).filter(part => part !== '')
    const list: { label: string; path: string }[] = []
    let current = ''
    for (const part of parts) {
      current = current === '' ? part : `${current}\\${part}`
      list.push({ label: part, path: current })
    }
    return list
  }, [root])

  const matching = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (needle === '') return dir.entries
    return dir.entries.filter(entry => entry.name.toLowerCase().includes(needle))
  }, [dir.entries, search])

  return (
    <>
      <div className={css.pathCrumbs}>
        <button type="button" className={css.crumb} onClick={() => { void loadDir(root) }}>
          {workspaceTitle}
        </button>
        {crumbs.slice(1).map(crumb => (
          <span key={crumb.path}>
            <span style={{ opacity: 0.5 }}> / </span>
            <button type="button" className={css.crumb} onClick={() => { void loadDir(crumb.path) }}>{crumb.label}</button>
          </span>
        ))}
      </div>
      <div className={css.header} style={{ borderBottom: 'none' }}>
        <Search size={13} style={{ flex: 'none', opacity: 0.6 }} />
        <input className={css.search} placeholder={t('filesSearchPlaceholder')}
          value={search} onChange={event => { setSearch(event.target.value) }} />
      </div>
      <div className={css.scroll}>
        {dir.error !== null
          ? <div className={css.error}>{dir.error}</div>
          : matching.length === 0
            ? (
              <div className={css.emptyWrap}>
                <FolderOpen size={22} />
                <span>{t('filesEmpty')}</span>
              </div>
            )
            : matching.map(entry => {
                const childPath = `${root}\\${entry.name}`
                const isDir = entry.kind === 'directory'
                return (
                  <div key={entry.name} className={css.fileRow} onClick={() => { void openPath(childPath, isDir) }}>
                    {isDir
                      ? (expanded.has(childPath) ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
                      : <span style={{ width: 12, flex: 'none' }} />}
                    {isDir ? <Folder size={14} style={{ flex: 'none', opacity: 0.7 }} /> : <File size={14} style={{ flex: 'none', opacity: 0.7 }} />}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                    {entry.size !== null && <span style={{ opacity: 0.5, fontSize: 11 }}>{entry.size}</span>}
                  </div>
                )
              })}
        {dir.truncated && <div className={css.note}>…</div>}
      </div>
      {preview.path !== null && (
        <div style={{ borderTop: '1px solid var(--cx-line)', display: 'flex', flexDirection: 'column', minHeight: 120, maxHeight: 260 }}>
          <div className={css.header} style={{ borderBottom: 'none' }}>
            <ArrowLeft size={13} />
            <span className={css.rowLabel}>{displayName(preview.path)}</span>
            <button type="button" className={css.iconButton} title={t('panelFiles')}
              onClick={() => { setPreview({ path: null, kind: 'text', content: '', truncated: false, dirty: false, saving: false }) }}>
              <ChevronDown size={13} />
            </button>
          </div>
          {preview.kind === 'binary'
            ? <div className={css.empty}>{t('filesBinary')}</div>
            : preview.kind === 'missing'
              ? <div className={css.empty}>{t('filesMissing')}</div>
              : (
                <>
                  <textarea
                    className={css.code}
                    style={{ resize: 'none', border: 'none', background: 'transparent', color: 'inherit', outline: 'none', flex: 1 }}
                    value={preview.content}
                    spellCheck={false}
                    onChange={event => { setPreview(prev => ({ ...prev, content: event.target.value, dirty: true })) }}
                  />
                  <div className={css.inputRow}>
                    {preview.truncated && <span className={css.note}>{t('filesTruncated')}</span>}
                    <button type="button" className={css.primaryButton} disabled={!preview.dirty || preview.saving}
                      onClick={() => { void savePreview() }}>
                      <Save size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                      {preview.saving ? '…' : t('panelFiles')}
                    </button>
                  </div>
                </>
              )}
        </div>
      )}
    </>
  )
}

/** Stable import surface for panels that only need listing helpers. */
export { parentOf, displayName }
