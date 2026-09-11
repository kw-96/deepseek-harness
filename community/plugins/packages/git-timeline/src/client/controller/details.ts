/** 面板的读取器：把 Remote 读操作收敛成界面状态对象（不持有 React 状态）。 */

import type { GitPanelApi } from '../lib/faces.js'
import type { CommitDetailState, DiffState, OpenCommitFile, OpenDiff } from './state.js'
import { reasonText } from './state.js'

/** 读取一个文件的差异（索引侧或工作区侧）。 */
export async function loadDiffState(api: GitPanelApi, cwd: string, target: OpenDiff): Promise<DiffState> {
  try {
    const result = await api.diff(cwd, target.path, target.staged)
    return { status: 'ready', text: result.text, truncated: result.truncated, error: null }
  } catch (reason) {
    return { status: 'error', text: '', truncated: false, error: reasonText(reason) }
  }
}

/** 读取一条提交的详情（元信息 + 改动文件）。 */
export async function loadCommitState(api: GitPanelApi, cwd: string, hash: string): Promise<CommitDetailState> {
  try {
    return { status: 'ready', detail: await api.show(cwd, hash), error: null }
  } catch (reason) {
    return { status: 'error', detail: null, error: reasonText(reason) }
  }
}

/** 读取某条提交里某个文件的差异。 */
export async function loadCommitFileState(
  api: GitPanelApi,
  cwd: string,
  target: OpenCommitFile,
): Promise<DiffState> {
  try {
    const result = await api.showFile(cwd, target.hash, target.path)
    return { status: 'ready', text: result.text, truncated: result.truncated, error: null }
  } catch (reason) {
    return { status: 'error', text: '', truncated: false, error: reasonText(reason) }
  }
}

/** 读取本地分支名；失败时回落到空列表并给出错误文本。 */
export async function loadBranches(api: GitPanelApi, cwd: string): Promise<{ names: readonly string[]; error: string | null }> {
  try {
    const result = await api.branches(cwd)
    return { names: result.names, error: result.error }
  } catch (reason) {
    return { names: [], error: reasonText(reason) }
  }
}
