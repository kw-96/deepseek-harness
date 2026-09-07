/** 文件树 + 可收起/展开的工作区搜索，根目录为会话工作区。 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react'
import type { CodexApi } from '../../RightPanel.js'
import type { FsListEntry } from 'dsh-codex-shell/types'
import type { SessionMetaStore } from '../../session-meta.js'
import type { SessionId, TFn } from '../../faces.js'
import { FilesPreview, type FilesPreviewState } from './FilesPreview.js'
import { FilesSearchBar } from './FilesSearchBar.js'
import { FilesSearchResults } from './FilesSearchResults.js'
import { useFilesSearch, type FilesSearchForm } from './useFilesSearch.js'
import css from '../../styles.module.css'

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

const initialForm: FilesSearchForm = {
  query: '', replace: '', include: '', exclude: '',
  matchCase: false, matchWholeWord: false, useRegex: false, expanded: false,
}

const emptyPreview: FilesPreviewState = {
  path: null, kind: 'text', content: '', truncated: false, dirty: false, saving: false,
}

/**
 * 右侧文件面板。
 * @param props API、文案与会话工作目录
 */
export function FilesPanel({ api, t, cwd, workspaceTitle }: FilesPanelProps): React.ReactNode {
  const [root, setRoot] = useState<string>(cwd ?? '')
  const [dir, setDir] = useState<DirState>({ entries: [], truncated: false, error: null })
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [preview, setPreview] = useState<FilesPreviewState>(emptyPreview)
  const [form, setForm] = useState<FilesSearchForm>(initialForm)
  const [replaceBusy, setReplaceBusy] = useState(false)
  const { search, replaceAll } = useFilesSearch(api, root, form)
  const querying = form.query.trim() !== ''

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
    } catch {
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

  const replaceLabel = search.replaceMessage === null
    ? null
    : search.replaceMessage === 'failed'
      ? t('filesReplaceFailed')
      : t('filesReplaceDone').replace('{n}', search.replaceMessage)

  return (
    <div className={css.filesRoot}>
      <div className={css.pathCrumbs}>
        <button type="button" className={css.crumb} onClick={() => { void loadDir(root) }}>{workspaceTitle}</button>
        {crumbs.slice(1).map(crumb => (
          <span key={crumb.path}>
            <span style={{ opacity: 0.5 }}> / </span>
            <button type="button" className={css.crumb} onClick={() => { void loadDir(crumb.path) }}>{crumb.label}</button>
          </span>
        ))}
      </div>
      <FilesSearchBar form={form} onChange={setForm} replaceBusy={replaceBusy} t={t}
        onReplaceAll={() => {
          setReplaceBusy(true)
          void replaceAll().finally(() => { setReplaceBusy(false) })
        }} />
      <div className={css.filesScroll}>
        {querying
          ? <FilesSearchResults search={search} root={root} t={t} replaceLabel={replaceLabel}
              onOpen={(path, isDir) => { void openPath(path, isDir) }} />
          : dir.error !== null
            ? <div className={css.error}>{dir.error}</div>
            : dir.entries.length === 0
              ? <div className={css.emptyWrap}><FolderOpen size={22} /><span>{t('filesEmpty')}</span></div>
              : dir.entries.map(entry => {
                  const childPath = `${root}\\${entry.name}`
                  const isDir = entry.kind === 'directory'
                  return (
                    <div key={entry.name} className={css.fileRow} onClick={() => { void openPath(childPath, isDir) }}>
                      {isDir
                        ? (expanded.has(childPath) ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
                        : <span style={{ width: 12, flex: 'none' }} />}
                      {isDir
                        ? <Folder size={14} style={{ flex: 'none', opacity: 0.7 }} />
                        : <File size={14} style={{ flex: 'none', opacity: 0.7 }} />}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                      {entry.size !== null && <span style={{ opacity: 0.5, fontSize: 11 }}>{entry.size}</span>}
                    </div>
                  )
                })}
        {!querying && dir.truncated && <div className={css.note}>…</div>}
      </div>
      <FilesPreview preview={preview} onChange={setPreview} onSave={() => { void savePreview() }}
        onClose={() => { setPreview(emptyPreview) }} t={t} />
    </div>
  )
}
