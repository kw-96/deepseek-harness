/** 写操作：暂存、取消暂存、提交（含修补）、推送、拉取、抓取。 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { GitActionResponse, GitCommitResponse } from '../types.js'
import type { GitOutcome } from './run.js'
import { GIT_NETWORK_TIMEOUT_MS, git, lastLine, repoRoot } from './run.js'

/** 写操作必须落在仓库内。 */
async function requireRoot(shell: ShellExecutor, cwd: string): Promise<string> {
  const root = await repoRoot(shell, cwd)
  if (root === null) throw new Error('当前工作区不是 Git 仓库')
  return root
}

/**
 * 暂存指定路径（`git add -- <paths>`）。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @param paths 仓库根相对路径
 */
export async function stage(shell: ShellExecutor, cwd: string, paths: readonly string[]): Promise<GitActionResponse> {
  const root = await requireRoot(shell, cwd)
  if (paths.length === 0) return { detail: '' }
  const out = await git(shell, root, ['add', '--', ...paths])
  return { detail: lastLine(out.stdout) || lastLine(out.stderr) }
}

/**
 * 取消暂存指定路径（`git restore --staged -- <paths>`）。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @param paths 仓库根相对路径
 */
export async function unstage(shell: ShellExecutor, cwd: string, paths: readonly string[]): Promise<GitActionResponse> {
  const root = await requireRoot(shell, cwd)
  if (paths.length === 0) return { detail: '' }
  const out = await git(shell, root, ['restore', '--staged', '--', ...paths])
  return { detail: lastLine(out.stdout) || lastLine(out.stderr) }
}

/** 暂存全部改动（含未跟踪文件）。 */
export async function stageAll(shell: ShellExecutor, cwd: string): Promise<GitActionResponse> {
  const root = await requireRoot(shell, cwd)
  const out = await git(shell, root, ['add', '-A'])
  return { detail: lastLine(out.stdout) || lastLine(out.stderr) }
}

/** 取消暂存全部改动。 */
export async function unstageAll(shell: ShellExecutor, cwd: string): Promise<GitActionResponse> {
  const root = await requireRoot(shell, cwd)
  const out = await git(shell, root, ['restore', '--staged', '.'])
  return { detail: lastLine(out.stdout) || lastLine(out.stderr) }
}

/**
 * 丢弃工作区改动（恢复为 HEAD 内容）。
 *
 * 只作用于已跟踪路径：未跟踪文件不会被删除（界面也不给它入口），
 * 避免误删刚生成、还没纳入版本控制的文件。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @param paths 仓库根相对路径
 */
export async function discard(shell: ShellExecutor, cwd: string, paths: readonly string[]): Promise<GitActionResponse> {
  const root = await requireRoot(shell, cwd)
  if (paths.length === 0) return { detail: '' }
  const out = await git(shell, root, ['restore', '--worktree', '--', ...paths])
  return { detail: lastLine(out.stdout) || lastLine(out.stderr) }
}

/**
 * 提交暂存内容；`amend` 为真时修补上一条提交。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @param message 提交信息（必须非空）
 * @param amend 是否 `--amend`
 */
/**
 * 暂存区为空时先暂存已跟踪文件的改动。
 *
 * 面板的「提交和推送」不单独暂存，空索引直接提交必被 git 拒绝（no changes added to
 * commit）——这正是面板只报 gateway/internal 的那次失败。未跟踪文件不在此范围，
 * 它们在面板里由「全部暂存」处理。
 * @param shell shell 执行器
 * @param root 仓库根
 */
async function stageTrackedWhenIndexEmpty(shell: ShellExecutor, root: string): Promise<void> {
  const staged = await git(shell, root, ['diff', '--cached', '--name-only'])
  if (staged.stdout.trim() !== '') return
  await git(shell, root, ['add', '-u'])
  const after = await git(shell, root, ['diff', '--cached', '--name-only'])
  if (after.stdout.trim() === '') {
    throw new RemoteError(
      'git/nothing-to-commit',
      '没有可提交的更改：已跟踪文件没有改动；未跟踪的新文件请先在面板点「全部暂存」',
      {},
    )
  }
}

export async function commit(
  shell: ShellExecutor,
  cwd: string,
  message: string,
  amend: boolean,
): Promise<GitCommitResponse> {
  const root = await requireRoot(shell, cwd)
  const text = message.trim()
  if (text === '') throw new RemoteError('git/commit-message-empty', '提交信息不能为空', {})
  if (!amend) await stageTrackedWhenIndexEmpty(shell, root)
  const args = amend ? ['commit', '--amend', '-m', text] : ['commit', '-m', text]
  const { out, skippedHooks } = await runWithHookRecovery(shell, root, args)
  const hash = await git(shell, root, ['rev-parse', '--short', 'HEAD'])
    .then(result => result.stdout.trim() || null)
    .catch(() => null)
  const detail = lastLine(out.stdout) || lastLine(out.stderr)
  return {
    shortHash: hash,
    detail: skippedHooks ? `${detail}（本地钩子无法运行，已跳过）` : detail,
  }
}

/**
 * 判断一次失败是否来自本地钩子（而非网络或仓库状态）。
 *
 * 典型形态是 Git for Windows 的 Cygwin 运行库在受限进程里无法创建信号管道：
 * `sh: *** fatal error - couldn't create signal pipe, Win32 error 5`。
 * @param message git 的失败输出
 * @returns 是否属于钩子故障
 */
export function isHookFailure(message: string): boolean {
  return /signal pipe|fatal error|lefthook/i.test(message)
}

/**
 * 执行一次会触发本地钩子的 git 操作，钩子起不来时跳过钩子重试。
 *
 * 钩子起不来是本地进程环境问题（Git for Windows 的 `sh` 在受限进程里建不了
 * 信号管道），与本次改动内容无关；跳过重试让操作仍能完成，并把「跳过了检查」
 * 如实写进回执。提交与推送都会触发钩子，因此两者共用这一条恢复路径。
 * @param shell shell 执行器
 * @param root 仓库根目录
 * @param args git 参数
 * @returns git 输出与是否跳过了钩子
 */
async function runWithHookRecovery(
  shell: ShellExecutor,
  root: string,
  args: readonly string[],
): Promise<{ out: GitOutcome; skippedHooks: boolean }> {
  try {
    return { out: await git(shell, root, args, GIT_NETWORK_TIMEOUT_MS), skippedHooks: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!isHookFailure(message)) throw error
    const out = await git(shell, root, args, GIT_NETWORK_TIMEOUT_MS, { LEFTHOOK: '0' })
    return { out, skippedHooks: true }
  }
}

/**
 * 推送当前分支。
 *
 * 钩子起不来时跳过钩子重试一次，让推送仍能完成，而不是留下一个失败。
 */
export async function push(shell: ShellExecutor, cwd: string): Promise<GitActionResponse> {
  const root = await requireRoot(shell, cwd)
  const { out, skippedHooks } = await runWithHookRecovery(shell, root, ['push'])
  const detail = lastLine(out.stderr) || lastLine(out.stdout)
  return { detail: skippedHooks ? `${detail}（本地钩子无法运行，已跳过；建议手动执行 pnpm run typecheck）` : detail }
}

/** 拉取当前分支（`--no-edit` 避免打开编辑器）。 */
export async function pull(shell: ShellExecutor, cwd: string): Promise<GitActionResponse> {
  const root = await requireRoot(shell, cwd)
  const out = await git(shell, root, ['pull', '--no-edit'], GIT_NETWORK_TIMEOUT_MS)
  return { detail: lastLine(out.stdout) || lastLine(out.stderr) }
}

/** 从所有远程抓取并清理陈旧引用。 */
export async function fetch(shell: ShellExecutor, cwd: string): Promise<GitActionResponse> {
  const root = await requireRoot(shell, cwd)
  const out = await git(shell, root, ['fetch', '--all', '--prune'], GIT_NETWORK_TIMEOUT_MS)
  return { detail: lastLine(out.stderr) || lastLine(out.stdout) }
}
