/**
 * 文件面板（VSCode/Cursor 式 Explorer）：顶部搜索栏、只读根目录名
 * 标题行、树形目录就地展开/收起（懒加载子目录、缩进层级）、选中
 * 文件预览，以及底部「每个文件对应的 git 时间线」（未选中文件时
 * 显示仓库最近提交）。
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from 'lucide-react'
import type { CodexApi } from '../../RightPanel.js'
import type { FsListEntry } from 'dsh-codex-shell/types'
import type { SessionId, TFn } from '../../faces.js'
import { FilesPreview, type FilesPreviewState } from './FilesPreview.js'
import { FilesSearchBar } from './FilesSearchBar.js'
import { FilesSearchResults } from './FilesSearchResults.js'
import { FilesTimeline } from './FilesTimeline.js'
import { useFilesSearch, type FilesSearchForm } from './useFilesSearch.js'
import css from '../../styles.module.css'

interface FilesPanelProps {
  api: CodexApi
  t: TFn
  cwd?: string | undefined
  sessionId?: SessionId | undefined
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

/** 根目录名（不含路径），盘符根等无末段时回退为原路径。 */
export function dirName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  if (trimmed === '') return path
  const idx = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return idx < 0 ? trimmed : trimmed.slice(idx + 1)
}

/**
 * 右侧文件面板。
 * @param props API、文案与会话工作目录
 */
export function FilesPanel({ api, t, cwd }: FilesPanelProps): React.ReactNode {
  const [root, setRoot] = useState<string>(cwd ?? '')
  const [dirs, setDirs] = useState<ReadonlyMap<string, DirState>>(new Map())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [preview, setPreview] = useState<FilesPreviewState>(emptyPreview)
  const [form, setForm] = useState<FilesSearchForm>(initialForm)
  const [replaceBusy, setReplaceBusy] = useState(false)
  const autoExpanded = useRef(false)
  const { search, replaceAll } = useFilesSearch(api, root, form)
  const querying = form.query.trim() !== ''

  useEffect(() => {
    if (cwd !== undefined && root === '') setRoot(cwd)
  }, [cwd, root])

  const loadDir = useCallback(async (path: string): Promise<void> => {
    try {
      const result = await api.fsList(path)
      setDirs(prev => new Map(prev).set(path, { entries: result.entries, truncated: result.truncated, error: null }))
      // 打开面板即展开根目录下的第一层子目录，让树形结构直接可见。
      if (path === root && !autoExpanded.current) {
        autoExpanded.current = true
        const childDirs = result.entries.filter(entry => entry.kind === 'directory')
        setExpanded(prev => new Set([...prev, ...childDirs.map(entry => `${path}\\${entry.name}`)]))
        for (const entry of childDirs) void loadDir(`${path}\\${entry.name}`)
      }
    } catch (error) {
      setDirs(prev => new Map(prev).set(path, {
        entries: [], truncated: false, error: error instanceof Error ? error.message : String(error),
      }))
    }
  }, [api, root])

  useEffect(() => {
    if (root === '') return
    void loadDir(root)
  }, [root, loadDir])

  /** 展开/收起目录；首次展开时懒加载其条目。 */
  const toggleDir = (path: string): void => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
    if (!dirs.has(path)) void loadDir(path)
  }

  const openFile = async (path: string): Promise<void> => {
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

  /** 递归渲染某目录的条目行（目录展开时继续渲染其子层）。 */
  const renderEntries = (path: string, depth: number): React.ReactNode[] => {
    const state = dirs.get(path)
    if (state === undefined || state.error !== null) return []
    return state.entries.map(entry => {
      const childPath = `${path}\\${entry.name}`
      const isDir = entry.kind === 'directory'
      const isOpen = isDir && expanded.has(childPath)
      return (
        <Fragment key={childPath}>
          <div className={depth > 0 ? `${css.fileRow} ${css.fileRowNested}` : css.fileRow}
            style={{ paddingLeft: 8 + depth * 16 }}
            onClick={() => { isDir ? toggleDir(childPath) : void openFile(childPath) }}>
            {isDir
              ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
              : <span style={{ width: 12, flex: 'none' }} />}
            {isDir
              ? <Folder size={14} style={{ flex: 'none', opacity: 0.7 }} />
              : <File size={14} style={{ flex: 'none', opacity: 0.7 }} />}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
            {entry.size !== null && <span style={{ opacity: 0.5, fontSize: 11 }}>{entry.size}</span>}
          </div>
          {isOpen && renderEntries(childPath, depth + 1)}
        </Fragment>
      )
    })
  }

  const rootState = dirs.get(root)
  const replaceLabel = search.replaceMessage === null
    ? null
    : search.replaceMessage === 'failed'
      ? t('filesReplaceFailed')
      : t('filesReplaceDone').replace('{n}', search.replaceMessage)

  return (
    <div className={css.filesRoot}>
      <FilesSearchBar form={form} onChange={setForm} replaceBusy={replaceBusy} t={t}
        onReplaceAll={() => {
          setReplaceBusy(true)
          void replaceAll().finally(() => { setReplaceBusy(false) })
        }} />
      <div className={css.filesDirHead}>
        <span className={css.filesDirName} title={root}>{dirName(root)}</span>
      </div>
      <div className={css.filesScroll}>
        {querying
          ? <FilesSearchResults search={search} root={root} t={t} replaceLabel={replaceLabel}
              onOpen={(path, isDir) => {
                if (isDir) toggleDir(path)
                else void openFile(path)
              }} />
          : rootState === undefined
            ? null
            : rootState.error !== null
              ? <div className={css.error}>{rootState.error}</div>
              : rootState.entries.length === 0
                ? <div className={css.emptyWrap}><FolderOpen size={22} /><span>{t('filesEmpty')}</span></div>
                : renderEntries(root, 0)}
        {!querying && rootState?.truncated === true && <div className={css.note}>…</div>}
      </div>
      <FilesPreview preview={preview} onChange={setPreview} onSave={() => { void savePreview() }}
        onClose={() => { setPreview(emptyPreview) }} t={t} />
      <FilesTimeline api={api} cwd={root} path={preview.path} t={t} />
    </div>
  )
}
