/** Git 面板控制器：Remote 读取、动作执行、差异与提交详情的状态机。 */

import { useCallback, useRef, useState } from 'react'
import type { GitIdentity, GitLogResponse, GitStatusResponse } from '../../types.js'
import { draftMessage, previousMessage } from './actions.js'
import { loadCommitFileState, loadCommitState, loadDiffState } from './details.js'
import { useBranchMenu } from './useBranchMenu.js'
import { usePanelSync } from './usePanelSync.js'
import {
  runCheckout, runCommit, runCreateBranch, runDiscard, runRemote, runSetIdentity, runToggleAll, runToggleStage,
} from './actions.js'
import { splitPath } from '../lib/format.js'
import type {
  CommitAction, CommitDetailState, DiffState, GitPanelController, OpenCommitFile, OpenDiff, UseGitPanelOptions,
} from './state.js'
import { reasonText } from './state.js'
import type { GitPanelApi, TFn } from '../lib/faces.js'

/**
 * 组装面板的读取、动作与展开状态。
 * @param options 会话、工作目录、文案与注入的 git 面
 * @returns 界面可直接消费的状态与回调
 */
export function useGitPanel(options: UseGitPanelOptions): GitPanelController {
  const { sessionId, cwd, t, api, files } = options
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
  const [openDiff, setOpenDiff] = useState<OpenDiff | null>(null)
  const [diff, setDiff] = useState<DiffState | null>(null)
  const [openCommit, setOpenCommit] = useState<string | null>(null)
  const [detail, setDetail] = useState<CommitDetailState | null>(null)
  const [openCommitFile, setOpenCommitFile] = useState<OpenCommitFile | null>(null)
  const [commitDiff, setCommitDiff] = useState<DiffState | null>(null)
  const injected = useRef({ api, t })
  injected.current = { api, t }

  /** 读取一个文件的差异（索引侧或工作区侧）。 */
  const loadDiff = useCallback(async (root: string, target: OpenDiff): Promise<void> => {
    setDiff({ status: 'loading', text: '', truncated: false, error: null })
    setDiff(await loadDiffState(injected.current.api, root, target))
  }, [])

  /** 读取一条提交的详情（元信息 + 改动文件）。 */
  const loadCommit = useCallback(async (root: string, hash: string): Promise<void> => {
    setDetail({ status: 'loading', detail: null, error: null })
    setDetail(await loadCommitState(injected.current.api, root, hash))
  }, [])

  /** 读取某条提交里某个文件的差异（读提交，与工作区差异互不影响）。 */
  const loadCommitDiff = useCallback(async (root: string, target: OpenCommitFile): Promise<void> => {
    setCommitDiff({ status: 'loading', text: '', truncated: false, error: null })
    setCommitDiff(await loadCommitFileState(injected.current.api, root, target))
  }, [])

  /** 重新读取状态；展开中的差异一并刷新，保持与列表一致。 */
  const refreshStatus = useCallback(async (): Promise<void> => {
    if (cwd === undefined) return
    setStatus(await injected.current.api.status(cwd))
    if (openDiff !== null) await loadDiff(cwd, openDiff)
  }, [cwd, loadDiff, openDiff])

  /** 全量刷新：状态 + 历史 + 身份。 */
  const refresh = useCallback(async (): Promise<void> => {
    if (cwd === undefined) return
    const current = injected.current.api
    const [nextStatus, nextLog, nextIdentity] = await Promise.all([
      current.status(cwd), current.log(cwd), current.identity(cwd),
    ])
    setStatus(nextStatus)
    setLog(nextLog)
    setIdentity(nextIdentity)
    if (openDiff !== null) await loadDiff(cwd, openDiff)
  }, [cwd, loadDiff, openDiff])

  const reportError = useCallback((message: string) => { setError(message) }, [])
  usePanelSync({ sessionId, cwd, files, refresh, refreshStatus, onError: reportError })

  /** 统一的动作包装：忙碌标记、错误收集与刷新。 */
  const run = async (operation: () => Promise<string>): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const detailText = await operation()
      if (detailText !== '') setNotice(detailText)
      await refresh()
    } catch (reason) {
      setError(reasonText(reason))
    } finally {
      setBusy(false)
    }
  }

  /** 动作上下文：把当前的 api / cwd / t 打包给纯函数实现。 */
  const context = (): { api: GitPanelApi; cwd: string; t: TFn } => ({
    api: injected.current.api, cwd: cwd ?? '', t: injected.current.t,
  })

  const commitNow = (): void => {
    void run(async () => {
      const result = await runCommit(context(), message, action)
      setMessage('')
      return result
    })
  }

  /** 切到「提交(修改)」且输入框为空时，预填上一条提交信息。 */
  const chooseAction = (next: CommitAction): void => {
    setAction(next)
    if (next !== 'amend' || cwd === undefined || message.trim() !== '') return
    void previousMessage(injected.current.api, cwd).then(text => { if (text !== '') setMessage(text) })
  }

  /** 展开一条提交的详情；与文件差异互斥，避免两个手风琴同时占高。 */
  const openCommitDetail = (hash: string): void => {
    if (cwd === undefined) return
    setOpenDiff(null)
    setDiff(null)
    setOpenCommit(hash)
    setOpenCommitFile(null)
    setCommitDiff(null)
    void loadCommit(cwd, hash)
  }

  /** 展开/收起提交内某个文件的差异。 */
  const toggleCommitFile = (hash: string, path: string): void => {
    if (cwd === undefined) return
    const open = openCommitFile !== null && openCommitFile.hash === hash && openCommitFile.path === path
    if (open) { setOpenCommitFile(null); setCommitDiff(null); return }
    const target: OpenCommitFile = { hash, path }
    setOpenCommitFile(target)
    void loadCommitDiff(cwd, target)
  }

  const branchMenu = useBranchMenu({
    cwd,
    api: injected.current.api,
    t: injected.current.t,
    run,
    onError: message => { setError(message) },
  })

  const generate = (): void => {
    setGenerating(true)
    setError(null)
    draftMessage(injected.current.api, sessionId, cwd).then(setMessage, (reason: unknown) => {
      setError(reasonText(reason))
    }).finally(() => { setGenerating(false) })
  }

  return {
    status, log, identity, message, setMessage, action, chooseAction, busy, generating, error, notice,
    clearMessage: () => { setError(null); setNotice(null) },
    locateSignal,
    locate: () => { setLocateSignal(value => value + 1) },
    openDiff, diff,
    openEntryDiff: (entry, staged) => {
      if (cwd === undefined) return
      const target: OpenDiff = { path: entry.path, staged }
      setOpenCommit(null)
      setDetail(null)
      setOpenDiff(target)
      void loadDiff(cwd, target)
    },
    closeDiff: () => { setOpenDiff(null); setDiff(null) },
    openCommit, detail, openCommitDetail,
    closeCommitDetail: () => { setOpenCommit(null); setDetail(null); setOpenCommitFile(null); setCommitDiff(null) },
    openCommitFile, commitDiff, toggleCommitFile,
    ...branchMenu,
    saveIdentity: (name, email, scope) => {
      void run(async () => await runSetIdentity(context(), name, email, scope))
    },
    runAction: (task) => {
      void run(async () => (task === 'refresh' ? '' : await runRemote(context(), task)))
    },
    commitNow,
    toggleStage: (entry, verb) => { void run(async () => await runToggleStage(context(), entry, verb)) },
    discardEntry: entry => { void run(async () => await runDiscard(context(), entry)) },
    stageAll: () => { void run(async () => await runToggleAll(context(), 'stage')) },
    unstageAll: () => { void run(async () => await runToggleAll(context(), 'unstage')) },
    generate,
    workspaceName: splitPath(status?.root ?? cwd ?? '').name,
  }
}
