/** 写操作：暂存、取消暂存、提交（含修补）、推送、拉取、抓取。 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { GitActionResponse, GitCommitResponse } from '../types.js'
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
export async function commit(
  shell: ShellExecutor,
  cwd: string,
  message: string,
  amend: boolean,
): Promise<GitCommitResponse> {
  const root = await requireRoot(shell, cwd)
  const text = message.trim()
  if (text === '') throw new Error('提交信息不能为空')
  const args = amend ? ['commit', '--amend', '-m', text] : ['commit', '-m', text]
  const out = await git(shell, root, args)
  const hash = await git(shell, root, ['rev-parse', '--short', 'HEAD'])
    .then(result => result.stdout.trim() || null)
    .catch(() => null)
  return { shortHash: hash, detail: lastLine(out.stdout) || lastLine(out.stderr) }
}

/** 推送当前分支。 */
export async function push(shell: ShellExecutor, cwd: string): Promise<GitActionResponse> {
  const root = await requireRoot(shell, cwd)
  const out = await git(shell, root, ['push'], GIT_NETWORK_TIMEOUT_MS)
  return { detail: lastLine(out.stderr) || lastLine(out.stdout) }
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
