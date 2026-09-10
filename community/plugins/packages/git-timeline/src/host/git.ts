/** 基于 ctx.shell 的 Git 只读查询：提交日志（可限定路径）与工作区变更清单。 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { ChangedFile, ChangedResponse, GitCommit, GitLogResponse } from '../types.js'

const GIT_TIMEOUT_MS = 30_000
/** 日志条数上限，避免一次拉取过长历史。 */
const MAX_COUNT = 200
/** 变更清单上限。 */
const MAX_CHANGED = 500

interface RunOutcome { exitCode: number | null; stdout: string; stderr: string }

/** 执行一条 git 命令；非零退出抛出 stderr 尾部。 */
async function git(
  shell: ShellExecutor,
  cwd: string,
  args: readonly string[],
  timeoutMs = GIT_TIMEOUT_MS,
): Promise<RunOutcome> {
  const quoted = args.map(arg => `'${String(arg).replaceAll("'", "'\\''")}'`).join(' ')
  const spec = shell.resolve({ command: `git ${quoted}`, workdir: cwd, timeoutMs, stdoutMaxBytes: 4 * 1024 * 1024 })
  const result = await shell.run(spec)
  if (result.exitCode !== 0) {
    const detail = result.stderr.text.trim() || result.stdout.text.trim() || `git exited ${String(result.exitCode)}`
    throw new Error(detail)
  }
  return { exitCode: result.exitCode, stdout: result.stdout.text, stderr: result.stderr.text }
}

/** 目标目录所属仓库根（绝对路径）；不在仓库内时返回 null。 */
export async function repoRoot(shell: ShellExecutor, cwd: string): Promise<string | null> {
  try {
    const out = await git(shell, cwd, ['rev-parse', '--show-toplevel'])
    const root = out.stdout.trim().split('\n')[0]?.trim() ?? ''
    return root === '' ? null : root
  } catch {
    return null
  }
}

/**
 * 把用户输入的路径规范成仓库根相对路径：绝对路径取其相对根的部分，
 * 相对路径按仓库根解释（仓库根相对与工作区相对通常是同一个）。
 * @param root 仓库根（绝对路径）
 * @param input 用户输入或列表给出的路径
 */
export function repoRelative(root: string, input: string): string {
  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/+$/, '')
  const normalized = input.trim().replaceAll('\\', '/')
  if (normalized === '') return ''
  const isAbsolute = /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('/')
  if (!isAbsolute) return normalized.replace(/^\.\//, '')
  const lowerRoot = normalizedRoot.toLowerCase()
  const lower = normalized.toLowerCase()
  if (lower === lowerRoot) return ''
  if (lower.startsWith(`${lowerRoot}/`)) return normalized.slice(normalizedRoot.length + 1)
  return normalized
}

/**
 * 解析 `git status --porcelain=v1 -z` 输出：重命名/复制条目后跟一段原路径。
 * @param raw NUL 分段的原始输出
 * @returns 变更文件列表
 */
export function parsePorcelain(raw: string): ChangedFile[] {
  const records = raw.split('\0')
  const files: ChangedFile[] = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? ''
    if (record.length < 4) continue
    const status = record.slice(0, 2)
    const path = record.slice(3)
    const renamed = status.includes('R') || status.includes('C')
    const origPath = renamed ? (records[index + 1] ?? '') : ''
    if (renamed) index += 1
    files.push({ path, origPath: origPath === '' ? null : origPath, status })
    if (files.length >= MAX_CHANGED) break
  }
  return files
}

/**
 * 读取提交日志；可限定到一个文件（仓库根相对或绝对路径）。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @param path 限定的文件路径；空表示整个仓库
 * @param count 条数上限
 */
export async function readLog(
  shell: ShellExecutor,
  cwd: string,
  path?: string,
  count?: number,
): Promise<GitLogResponse> {
  const root = await repoRoot(shell, cwd)
  if (root === null) return { repo: false, root: null, error: null, entries: [] }
  const limit = Math.max(1, Math.min(Math.trunc(count ?? 50), MAX_COUNT))
  const args = ['log', `-${String(limit)}`, '--format=%h%x1f%s%x1f%an%x1f%ai%x1f%D']
  const relative = path === undefined ? '' : repoRelative(root, path)
  if (relative !== '') args.push('--', relative)
  try {
    const out = await git(shell, root, args)
    const entries: GitCommit[] = []
    for (const line of out.stdout.split('\n')) {
      if (line === '') continue
      const [hash, subject, author, date, refs] = line.split('\x1f')
      entries.push({
        hash: hash ?? '', subject: subject ?? '', author: author ?? '', date: date ?? '', refs: refs ?? '',
      })
    }
    return { repo: true, root, error: null, entries }
  } catch (error) {
    // 空仓库等可预期失败：仓库识别成功但日志读不到，交给界面显示原因。
    return { repo: true, root, error: error instanceof Error ? error.message : String(error), entries: [] }
  }
}

/**
 * 读取工作区变更清单。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 */
export async function readChanged(shell: ShellExecutor, cwd: string): Promise<ChangedResponse> {
  const root = await repoRoot(shell, cwd)
  if (root === null) return { repo: false, root: null, error: null, files: [] }
  try {
    const out = await git(shell, root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    return { repo: true, root, error: null, files: parsePorcelain(out.stdout) }
  } catch (error) {
    return { repo: true, root, error: error instanceof Error ? error.message : String(error), files: [] }
  }
}
