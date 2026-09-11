/** Git 面板标签体：Changes 区（上半） + Graph 区（下半） + 固定底部栏。 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitEntry, GitIdentity, GitLogResponse, GitStatusResponse } from '../types.js'
import { BottomBar } from './BottomBar.js'
import { Changes, type CommitAction } from './Changes.js'
import { Graph } from './Graph.js'
import { splitPath } from './format.js'
import type { GitBodyRuntimeProps, GitPanelApi, TFn } from './faces.js'
import css from './styles.module.css'

export interface GitBodyInjected { api: GitPanelApi }

export interface GitBodyProps extends GitBodyRuntimeProps, GitBodyInjected {
  t: TFn
}

/**
 * Git 面板标签体。
 * @param props 会话运行时 props、注入的 git 面与文案
 */
export function GitBody({ sessionId, useSessions, t, api }: GitBodyProps): React.ReactNode {
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const [status, setStatus] = useState<GitStatusResponse | null>(null)
  const [log, setLog] = useState<GitLogResponse | null>(null)
  const [identity, setIdentity] = useState<GitIdentity | null>(null)
  const [message, setMessage] = useState('')
  const [action, setAction] = useState<CommitAction>('commit')
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [locateSignal, setLocateSignal] = useState(0)
  const injected = useRef({ api, t })
  injected.current = { api, t }

  const refresh = useCallback(async (): Promise<void> => {
    if (cwd === undefined) return
    const { api: current } = injected.current
    const [nextStatus, nextLog, nextIdentity] = await Promise.all([
      current.status(cwd),
      current.log(cwd),
      current.identity(cwd),
    ])
    setStatus(nextStatus)
    setLog(nextLog)
    setIdentity(nextIdentity)
  }, [cwd])

  useEffect(() => {
    if (cwd === undefined) return
    let cancelled = false
    refresh().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { cancelled = true }
  }, [cwd, refresh])

  /** 统一的动作包装：忙碌标记、错误收集与刷新。 */
  const run = async (operation: () => Promise<string>): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const detail = await operation()
      if (detail !== '') setNotice(detail)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const commitNow = (): void => {
    void run(async () => {
      if (cwd === undefined) return ''
      if (message.trim() === '') throw new Error(injected.current.t('noMessage'))
      const result = await injected.current.api.commit(cwd, message, action === 'amend')
      setMessage('')
      if (action === 'commitSync') await injected.current.api.pull(cwd)
      if (action === 'commitPush' || action === 'commitSync') await injected.current.api.push(cwd)
      return result.shortHash === null ? '' : `${injected.current.t('commit')} ${result.shortHash}`
    })
  }

  const toggleStage = (entry: GitEntry, verb: 'stage' | 'unstage'): void => {
    void run(async () => {
      if (cwd === undefined) return ''
      const paths = [entry.path]
      const result = verb === 'stage'
        ? await injected.current.api.stage(cwd, paths)
        : await injected.current.api.unstage(cwd, paths)
      return result.detail
    })
  }

  const generate = (): void => {
    if (cwd === undefined) return
    setGenerating(true)
    setError(null)
    injected.current.api.message(sessionId, cwd).then(
      (result) => { setMessage(result.message) },
      (reason: unknown) => { setError(reason instanceof Error ? reason.message : String(reason)) },
    ).finally(() => { setGenerating(false) })
  }

  if (cwd === undefined) return <div className={css.empty}>{t('notRepo')}</div>
  if (status !== null && !status.repo) return <div className={css.empty}>{t('notRepo')}</div>

  const workspaceName = splitPath(status?.root ?? cwd).name
  return (
    <div className={css.root}>
      <Changes
        t={t}
        status={status}
        message={message}
        onMessage={setMessage}
        generating={generating}
        onGenerate={generate}
        action={action}
        onAction={setAction}
        busy={busy}
        onCommit={commitNow}
        onStage={entry => { toggleStage(entry, 'stage') }}
        onUnstage={entry => { toggleStage(entry, 'unstage') }}
        onStageAll={() => { void run(async () => (await injected.current.api.stageAll(cwd)).detail) }}
        onUnstageAll={() => { void run(async () => (await injected.current.api.unstageAll(cwd)).detail) }}
      />
      {(error !== null || notice !== null) && (
        <div className={error === null ? css.notice : css.error} onClick={() => { setError(null); setNotice(null) }}>
          {error ?? notice}
        </div>
      )}
      <Graph
        t={t}
        log={log}
        branch={status?.branch ?? null}
        busy={busy}
        locateSignal={locateSignal}
        onLocate={() => { setLocateSignal(value => value + 1) }}
        onFetch={() => { void run(async () => (await injected.current.api.fetch(cwd)).detail) }}
        onPull={() => { void run(async () => (await injected.current.api.pull(cwd)).detail) }}
        onPush={() => { void run(async () => (await injected.current.api.push(cwd)).detail) }}
        onRefresh={() => { void run(async () => '') }}
      />
      <BottomBar
        t={t}
        branch={status?.branch ?? null}
        ahead={status?.ahead ?? 0}
        behind={status?.behind ?? 0}
        identity={identity}
        workspaceName={workspaceName}
        busy={busy}
        onRefresh={() => { void run(async () => '') }}
      />
    </div>
  )
}
