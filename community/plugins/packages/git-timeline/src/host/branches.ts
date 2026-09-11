/** 分支：本地分支清单、切换与新建。 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { GitActionResponse, GitBranches } from '../types.js'
import { git, lastLine, repoRoot } from './run.js'

/**
 * 列出本地分支（按最近提交时间倒序，与分支切换器的常见顺序一致）。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 */
export async function readBranches(shell: ShellExecutor, cwd: string): Promise<GitBranches> {
  const root = await repoRoot(shell, cwd)
  if (root === null) return { repo: false, names: [], error: null }
  try {
    const out = await git(shell, root, [
      'for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads',
    ])
    const names = out.stdout.split('\n').map(line => line.trim()).filter(line => line !== '')
    return { repo: true, names, error: null }
  } catch (error) {
    return { repo: true, names: [], error: error instanceof Error ? error.message : String(error) }
  }
}

/** 切换分支（`git checkout <branch>`）。 */
export async function checkout(shell: ShellExecutor, cwd: string, branch: string): Promise<GitActionResponse> {
  const root = await repoRoot(shell, cwd)
  if (root === null) throw new Error('当前工作区不是 Git 仓库')
  const name = branch.trim()
  if (name === '') throw new Error('分支名不能为空')
  const out = await git(shell, root, ['checkout', name])
  return { detail: lastLine(out.stderr) || lastLine(out.stdout) }
}

/** 新建并切换到分支（`git checkout -b <name>`）；先做 `check-ref-format` 校验。 */
export async function createBranch(shell: ShellExecutor, cwd: string, name: string): Promise<GitActionResponse> {
  const root = await repoRoot(shell, cwd)
  if (root === null) throw new Error('当前工作区不是 Git 仓库')
  const branch = name.trim()
  if (branch === '') throw new Error('分支名不能为空')
  await git(shell, root, ['check-ref-format', '--branch', branch])
  const out = await git(shell, root, ['checkout', '-b', branch])
  return { detail: lastLine(out.stderr) || lastLine(out.stdout) }
}
