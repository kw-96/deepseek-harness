/** Git status/changes/diff/commit/branches/log tab for the Codex panel. */

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, GitBranch, GitCommitHorizontal, Minus, Plus, Undo2, FileDiff } from 'lucide-react'
import type { CodexApi } from '../RightPanel.js'
import type { GitLogResponse, GitStatusResponse } from 'dsh-codex-shell/types'
import type { TFn } from '../faces.js'
import css from '../styles.module.css'

interface GitPanelProps {
  api: CodexApi
  t: TFn
  cwd?: string | undefined
}

interface GitState {
  status: GitStatusResponse | null
  log: GitLogResponse | null
  diffText: string
  diffPath: string | null
  error: string | null
  message: string
  busy: boolean
}

export function GitPanel({ api, t, cwd }: GitPanelProps) {
  const [state, setState] = useState<GitState>({
    status: null, log: null, diffText: '', diffPath: null, error: null, message: '', busy: false,
  })

  const refresh = useCallback(async (): Promise<void> => {
    if (cwd === undefined) return
    setState(prev => ({ ...prev, busy: true }))
    try {
      const [status, log] = await Promise.all([api.gitStatus(cwd), api.gitLog(cwd, 40)])
      setState(prev => ({ ...prev, status, log, error: null, busy: false }))
    } catch (error) {
      setState(prev => ({ ...prev, error: error instanceof Error ? error.message : String(error), busy: false }))
    }
  }, [api, cwd])

  useEffect(() => { void refresh() }, [refresh])

  const showDiff = async (path: string | null, staged: boolean): Promise<void> => {
    if (cwd === undefined) return
    try {
      const result = await api.gitDiff(cwd, path ?? undefined, staged)
      setState(prev => ({ ...prev, diffText: result.text, diffPath: path }))
    } catch (error) {
      setState(prev => ({ ...prev, error: error instanceof Error ? error.message : String(error) }))
    }
  }

  const run = async (operation: () => Promise<unknown>): Promise<void> => {
    setState(prev => ({ ...prev, busy: true, error: null }))
    try {
      await operation()
      await refresh()
    } catch (error) {
      setState(prev => ({ ...prev, busy: false, error: error instanceof Error ? error.message : String(error) }))
    }
  }

  const commit = async (): Promise<void> => {
    if (cwd === undefined || state.message.trim() === '') return
    await run(async () => { await api.gitCommit(cwd, state.message) })
    setState(prev => ({ ...prev, message: '' }))
  }

  if (cwd === undefined) return <div className={css.emptyWrap}><GitBranch size={20} /><span>{t('gitNotRepo')}</span></div>

  const status = state.status
  if (status !== null && !status.isRepo) return <div className={css.emptyWrap}><GitBranch size={20} /><span>{t('gitNotRepo')}</span></div>

  const staged = status?.entries.filter(entry => entry.xy[0] !== ' ' && entry.xy[0] !== '?') ?? []
  const unstaged = status?.entries.filter(entry => entry.xy[1] !== ' ') ?? []

  return (
    <>
      <div className={css.header} style={{ borderBottom: 'none' }}>
        <span className={css.title}>{t('gitBranch')}: {status?.branch ?? '—'}</span>
        <button type="button" className={css.iconButton} title={t('gitRefresh')} disabled={state.busy}
          onClick={() => { void refresh() }}>
          <RefreshCw size={13} className={state.busy ? css.spin : undefined} />
        </button>
      </div>
      <div className={css.scroll}>
        {state.error !== null && <div className={css.error}>{state.error}</div>}
        {status === null && (
          <>
            <div className={css.skeleton} />
            <div className={css.skeleton} />
            <div className={css.skeleton} style={{ width: '60%' }} />
          </>
        )}
        <div className={css.groupHead}><span className={css.chipStaged}>{t('gitStaged')}</span><span className={css.count}>{staged.length}</span></div>
        {staged.map(entry => (
          <div key={`s:${entry.path}`} className={css.fileRow}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.path}</span>
            <button type="button" className={css.iconButton} title={t('gitUnstage')} onClick={() => { void run(() => api.gitUnstage(cwd, entry.path)) }}><Minus size={13} /></button>
            <button type="button" className={css.iconButton} title={t('panelGit')} onClick={() => { void showDiff(entry.path, true) }}><FileDiff size={13} /></button>
          </div>
        ))}
        <div className={css.groupHead}><span className={css.chipChanged}>{t('gitChanges')}</span><span className={css.count}>{unstaged.length}</span></div>
        {unstaged.map(entry => (
          <div key={`u:${entry.path}`} className={css.fileRow}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.path}</span>
            <button type="button" className={css.iconButton} title={t('gitStage')} onClick={() => { void run(() => api.gitStage(cwd, entry.path)) }}><Plus size={13} /></button>
            <button type="button" className={css.iconButton} title={t('gitDiscard')}
              onClick={() => { if (window.confirm(t('gitDiscardConfirm'))) void run(() => api.gitDiscard(cwd, entry.path)) }}><Undo2 size={13} /></button>
            <button type="button" className={css.iconButton} title={t('panelGit')} onClick={() => { void showDiff(entry.path, false) }}><FileDiff size={13} /></button>
          </div>
        ))}
        {state.diffText !== '' && (
          <pre className={css.code} style={{ maxHeight: 220, borderTop: '1px solid var(--cx-line)' }}>{state.diffText}</pre>
        )}
        <div className={css.groupHead}>{t('gitHistory')}</div>
        {state.log?.entries.map(entry => (
          <div key={entry.hash} className={css.fileRow}>
            <GitCommitHorizontal size={13} style={{ flex: 'none', opacity: 0.7 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.subject}</span>
            <span style={{ opacity: 0.5, fontSize: 11 }}>{entry.hash}</span>
          </div>
        ))}
      </div>
      <div className={css.inputRow}>
        <input className={css.textInput} placeholder={t('gitCommitMessage')} value={state.message}
          onChange={event => { setState(prev => ({ ...prev, message: event.target.value })) }}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) void commit() }} />
        <button type="button" className={css.primaryButton} disabled={state.busy || state.message.trim() === ''}
          onClick={() => { void commit() }}>{t('gitCommit')}</button>
      </div>
    </>
  )
}
