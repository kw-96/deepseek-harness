/** 在 ctx.shell 上执行 git：统一引号、超时与错误上抛。 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'

export const GIT_TIMEOUT_MS = 30_000
/** 网络类操作（fetch/pull/push）的超时上限。 */
export const GIT_NETWORK_TIMEOUT_MS = 120_000
/** 单条命令允许的 stdout 上限。 */
const STDOUT_MAX_BYTES = 8 * 1024 * 1024

export interface GitOutcome { stdout: string; stderr: string }

/**
 * 执行一条 git 命令。
 * @param shell shell 执行器
 * @param cwd 工作目录
 * @param args 参数（自动加引号）
 * @param timeoutMs 超时
 * @returns stdout / stderr 文本
 */
export async function git(
  shell: ShellExecutor,
  cwd: string,
  args: readonly string[],
  timeoutMs = GIT_TIMEOUT_MS,
): Promise<GitOutcome> {
  const quoted = args.map(arg => `'${String(arg).replaceAll("'", "'\\''")}'`).join(' ')
  const spec = shell.resolve({ command: `git ${quoted}`, workdir: cwd, timeoutMs, stdoutMaxBytes: STDOUT_MAX_BYTES })
  const result = await shell.run(spec)
  if (result.exitCode !== 0) {
    const detail = result.stderr.text.trim() || result.stdout.text.trim() || `git exited ${String(result.exitCode)}`
    throw new Error(detail)
  }
  return { stdout: result.stdout.text, stderr: result.stderr.text }
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
 * 把用户输入规范成仓库根相对路径：绝对路径取其相对根的部分，相对路径按
 * 仓库根解释。
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

/** 取 git 输出的最后一行非空文本，作为写操作的回执说明。 */
export function lastLine(text: string): string {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line !== '')
  return lines.at(-1) ?? ''
}
