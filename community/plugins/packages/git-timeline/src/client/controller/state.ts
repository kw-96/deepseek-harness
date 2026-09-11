/** 面板状态类型与提交动作定义（控制器、组件、测试共用）。 */

import type { GitCommitDetail, GitEntry, GitIdentity, GitLogResponse, GitStatusResponse } from '../../types.js'
import type { GitPanelApi, TFn, WorkspaceChangeFace } from '../lib/faces.js'

/** 提交按钮当前绑定的动作。 */
export type CommitAction = 'commit' | 'amend' | 'commitPush' | 'commitSync'

export const COMMIT_ACTIONS: readonly CommitAction[] = ['commit', 'amend', 'commitPush', 'commitSync']

/** 动作 → 文案键。 */
export function actionLabelKey(action: CommitAction): 'commit' | 'commitAmend' | 'commitPush' | 'commitSync' {
  switch (action) {
    case 'amend': return 'commitAmend'
    case 'commitPush': return 'commitPush'
    case 'commitSync': return 'commitSync'
    default: return 'commit'
  }
}

/** 当前展开的文件差异（与列表行一一对应）。 */
export interface OpenDiff {
  path: string
  staged: boolean
}

/** 一次差异读取的界面状态。 */
export interface DiffState {
  status: 'loading' | 'ready' | 'error'
  text: string
  truncated: boolean
  error: string | null
}

/** 一次提交详情读取的界面状态。 */
export interface CommitDetailState {
  status: 'loading' | 'ready' | 'error'
  detail: GitCommitDetail | null
  error: string | null
}

/** 提交详情里展开的文件差异（属于某条提交，与工作区差异分开保存）。 */
export interface OpenCommitFile {
  hash: string
  path: string
}

/** 把异常转成可展示的文本。 */
export function reasonText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/** 控制器入参。 */
export interface UseGitPanelOptions {
  sessionId: string
  cwd: string | undefined
  t: TFn
  api: GitPanelApi
  /** 会话文件变更流（可选）：把自动刷新挂在真实写入上。 */
  files?: WorkspaceChangeFace | undefined
}

/** 控制器对外暴露的状态与动作。 */
export interface GitPanelController {
  status: GitStatusResponse | null
  log: GitLogResponse | null
  identity: GitIdentity | null
  message: string
  setMessage: (value: string) => void
  action: CommitAction
  chooseAction: (action: CommitAction) => void
  busy: boolean
  generating: boolean
  error: string | null
  notice: string | null
  clearMessage: () => void
  locateSignal: number
  locate: () => void
  openDiff: OpenDiff | null
  diff: DiffState | null
  openEntryDiff: (entry: GitEntry, staged: boolean) => void
  closeDiff: () => void
  openCommit: string | null
  detail: CommitDetailState | null
  openCommitDetail: (hash: string) => void
  closeCommitDetail: () => void
  openCommitFile: OpenCommitFile | null
  commitDiff: DiffState | null
  toggleCommitFile: (hash: string, path: string) => void
  branchMenuOpen: boolean
  branchNames: readonly string[]
  toggleBranchMenu: () => void
  closeBranchMenu: () => void
  checkoutBranch: (branch: string) => void
  createBranch: (name: string) => void
  runAction: (task: 'fetch' | 'pull' | 'push' | 'refresh') => void
  commitNow: () => void
  toggleStage: (entry: GitEntry, verb: 'stage' | 'unstage') => void
  discardEntry: (entry: GitEntry) => void
  stageAll: () => void
  unstageAll: () => void
  generate: () => void
  workspaceName: string
}
