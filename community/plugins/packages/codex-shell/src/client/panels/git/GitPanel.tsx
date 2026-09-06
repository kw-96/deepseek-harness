/**
 * Git 面板（Cursor 式源代码管理）：顶部工具栏（分支/拉取/推送/更多）、
 * 提交区、路径筛选、已暂存/更改分组（单字母状态徽标 + 悬停操作）、
 * 内联着色差异与可折叠提交历史。
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, GitBranch, GitCommitHorizontal, Search } from 'lucide-react'
import type { CodexApi } from '../../RightPanel.js'
import type { GitBranchesResponse, GitLogResponse, GitStatusResponse } from 'dsh-codex-shell/types'
import type { TFn } from '../../faces.js'
import { GitToolbar } from './GitToolbar.js'
import { DiffView } from './DiffView.js'
import { GitFileList } from './GitFileList.js'
import { displayPath, matchesFilter, statusLetter, timeAgo } from './support.js'
import css from '../../styles.module.css'

interface GitPanelProps {
  api: CodexApi
  t: TFn
  cwd?: string | undefined
}

interface GitState {
  status: GitStatusResponse | null
  branches: GitBranchesResponse | null
  log: GitLogResponse | null
  diff: { path: string; text: string } | null
  error: string | null
  message: string
  filter: string
  busy: boolean
  historyOpen: boolean
}

/**
 * Git 面板组件。
 * @param api codexShell API 面
 * @param t 文案函数
 * @param cwd 会话工作目录
 */
export function GitPanel({ api, t, cwd }: GitPanelProps): React.ReactNode {
  const [state, setState] = useState<GitState>({
    status: null, branches: null, log: null, diff: null, error: null,
    message: '', filter: '', busy: false, historyOpen: false,
  })

  const refresh = useCallback(async (): Promise<void> => {
    if (cwd === undefined) return
    setState(prev => ({ ...prev, busy: true }))
    try {
      const [status, branches, log] = await Promise.all([
        api.gitStatus(cwd), api.gitBranches(cwd), api.gitLog(cwd, 40),
      ])
      setState(prev => ({ ...prev, status, branches, log, error: null, busy: false }))
    } catch (error) {
      setState(prev => ({ ...prev, error: error instanceof Error ? error.message : String(error), busy: false }))
    }
  }, [api, cwd])

  useEffect(() => { void refresh() }, [refresh])

  /** 执行一个 git 操作并刷新面板；失败时把错误写入面板顶部。 */
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

  const showDiff = async (path: string, staged: boolean): Promise<void> => {
    if (cwd === undefined) return
    try {
      const result = await api.gitDiff(cwd, path, staged)
      setState(prev => ({ ...prev, diff: { path, text: result.text }, error: null }))
    } catch (error) {
      setState(prev => ({ ...prev, error: error instanceof Error ? error.message : String(error) }))
    }
  }

  if (cwd === undefined) return <div className={css.emptyWrap}><GitBranch size={20} /><span>{t('gitNotRepo')}</span></div>

  const status = state.status
  if (status !== null && !status.isRepo) return <div className={css.emptyWrap}><GitBranch size={20} /><span>{t('gitNotRepo')}</span></div>

  const entries = status?.entries ?? []
  const staged = entries.filter(entry => statusLetter(entry, true) !== ' ')
  const changes = entries.filter(entry => statusLetter(entry, false) !== ' ')
  const stagedVisible = staged.filter(entry => matchesFilter(displayPath(entry), state.filter))
  const changesVisible = changes.filter(entry => matchesFilter(displayPath(entry), state.filter))

  return (
    <>
      <GitToolbar
        branch={status?.branch ?? null}
        ahead={status?.ahead ?? 0}
        behind={status?.behind ?? 0}
        changed={staged.length + changes.length}
        branches={state.branches?.names ?? []}
        currentBranch={state.branches?.current ?? null}
        busy={state.busy}
        onCheckout={branch => { void run(() => api.gitCheckout(cwd, branch)) }}
        onFetch={() => { void run(() => api.gitFetch(cwd)) }}
        onPull={() => { void run(() => api.gitPull(cwd)) }}
        onPush={() => { void run(() => api.gitPush(cwd)) }}
        onStageAll={() => { void run(() => api.gitStageAll(cwd)) }}
        onUnstageAll={() => { void run(() => api.gitUnstageAll(cwd)) }}
        onRefresh={() => { void refresh() }}
        t={t}
      />
      <div className={css.commitArea}>
        <textarea className={css.commitBox} rows={2} placeholder={t('gitCommitMessage')}
          value={state.message}
          onChange={event => { setState(prev => ({ ...prev, message: event.target.value })) }}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void commit()
          }} />
        <div className={css.commitRow}>
          <button type="button" className={css.commitButton}
            disabled={state.busy || state.message.trim() === '' || staged.length === 0}
            title={staged.length === 0 ? t('gitCommitHint') : undefined}
            onClick={() => { void commit() }}>
            {t('gitCommit')}
          </button>
        </div>
      </div>
      <div className={css.filterRow}>
        <Search size={12} style={{ flex: 'none', opacity: 0.7 }} />
        <input className={css.gitFilterInput} placeholder={t('gitFilterPlaceholder')}
          aria-label={t('gitFilterPlaceholder')} value={state.filter}
          onChange={event => { setState(prev => ({ ...prev, filter: event.target.value })) }} />
      </div>
      <div className={css.gitScroll}>
        {state.error !== null && <div className={css.error}>{state.error}</div>}
        {status === null && (
          <>
            <div className={css.skeleton} />
            <div className={css.skeleton} />
            <div className={css.skeleton} style={{ width: '60%' }} />
          </>
        )}
        {status !== null && (
          <GitFileList
            staged={stagedVisible}
            changes={changesVisible}
            clean={staged.length + changes.length === 0}
            onShowDiff={(path, isStaged) => { void showDiff(path, isStaged) }}
            onStage={path => { void run(() => api.gitStage(cwd, path)) }}
            onUnstage={path => { void run(() => api.gitUnstage(cwd, path)) }}
            onDiscard={path => { void run(() => api.gitDiscard(cwd, path)) }}
            t={t}
          />
        )}
        {state.diff !== null && (
          <DiffView path={state.diff.path} text={state.diff.text}
            onClose={() => { setState(prev => ({ ...prev, diff: null })) }}
            t={t} />
        )}
        {state.log !== null && state.log.entries.length > 0 && (
          <>
            <button type="button" className={css.historyHead} aria-expanded={state.historyOpen}
              onClick={() => { setState(prev => ({ ...prev, historyOpen: !prev.historyOpen })) }}>
              {state.historyOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>{t('gitHistory')}</span>
              <span className={css.count}>{state.log.entries.length}</span>
            </button>
            {state.historyOpen && state.log.entries.map(entry => (
              <div key={entry.hash} className={css.fileRow} title={entry.subject}>
                <GitCommitHorizontal size={13} style={{ flex: 'none', opacity: 0.7 }} />
                <span className={css.gitFilePath}>{entry.subject}</span>
                <span className={css.gitLogMeta}>{timeAgo(t, entry.date)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  )
}
