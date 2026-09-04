/** Git operations behind the codexShell Remote, built on ctx.shell. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-shell'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { FsContentSearchResponse, GitLogResponse, GitStatusResponse } from '../types.js'

const GIT_TIMEOUT_MS = 30_000

interface RunOutcome { exitCode: number | null; stdout: string; stderr: string }

/** Run one git command in a working directory; nonzero exits throw the stderr tail. */
async function git(shell: ShellExecutor, cwd: string, args: readonly string[]): Promise<RunOutcome> {
  const quoted = args.map(arg => `'${String(arg).replaceAll("'", "'\\''")}'`).join(' ')
  const spec = shell.resolve({ command: `git ${quoted}`, workdir: cwd, timeoutMs: GIT_TIMEOUT_MS, stdoutMaxBytes: 1024 * 1024 })
  const result = await shell.run(spec)
  if (result.exitCode !== 0) {
    const detail = result.stderr.text.trim() || result.stdout.text.trim() || `git exited ${String(result.exitCode)}`
    throw new Error(detail)
  }
  return { exitCode: result.exitCode, stdout: result.stdout.text, stderr: result.stderr.text }
}

/** Porcelain-v2 status with -z framing. */
export async function gitStatus(shell: ShellExecutor, cwd: string): Promise<GitStatusResponse> {
  let out: RunOutcome
  try {
    out = await git(shell, cwd, ['status', '--porcelain=v2', '-z', '--branch'])
  } catch (error) {
    // Not a repository: report as such instead of failing.
    return { isRepo: false, branch: null, entries: [] }
  }
  const raw = out.stdout
  const frames = raw.split('\0').filter(part => part !== '')
  let branch: string | null = null
  const entries: { path: string; xy: string }[] = []
  for (const frame of frames) {
    if (frame.startsWith('# branch.head ')) branch = frame.slice('# branch.head '.length) || null
    if (frame.startsWith('# branch.ab ')) continue
    if (frame.startsWith('1 ') || frame.startsWith('2 ') || frame.startsWith('u ')) {
      const meta = frame.slice(0, frame.indexOf(' '))
      const xy = meta[1] === ' ' ? `${meta[2]}${meta[3]}` : `${meta[1]}${meta[2]}${meta[3]}`
      const pathStart = frame.indexOf(' ', 2)
      const fields = pathStart < 0 ? [] : frame.slice(pathStart + 1).split('\0')
      const path = fields.find(field => field !== '' && !field.startsWith(' ')) ?? ''
      entries.push({ path, xy: xy.slice(0, 2) })
    }
  }
  return { isRepo: true, branch, entries }
}

/** Decorated short log (subject/author/date/refs per commit). */
export async function gitLog(shell: ShellExecutor, cwd: string, count = 50): Promise<GitLogResponse> {
  const out = await git(shell, cwd, ['log', `-${Math.max(1, Math.min(count, 200))}`, '--format=%h%x1f%s%x1f%an%x1f%ai%x1f%D'])
  const entries = out.stdout.split('\n').filter(line => line !== '').map(line => {
    const [hash, subject, author, date, refs] = line.split('\x1f')
    return { hash: hash ?? '', subject: subject ?? '', author: author ?? '', date: date ?? '', refs: refs ?? '' }
  })
  return { entries }
}

/** Diff text: staged toggle or one file (plain, no pager). */
export async function gitDiff(
  shell: ShellExecutor, cwd: string, path?: string, staged = false,
): Promise<{ text: string }> {
  const args = ['--no-pager', 'diff']
  if (staged) args.push('--staged')
  if (path !== undefined) args.push('--', path)
  const out = await git(shell, cwd, args)
  return { text: out.stdout }
}

export async function gitStage(shell: ShellExecutor, cwd: string, path?: string): Promise<{ ok: true }> {
  await git(shell, cwd, ['add', '--', ...(path === undefined ? [] : [path])])
  return { ok: true }
}

export async function gitUnstage(shell: ShellExecutor, cwd: string, path?: string): Promise<{ ok: true }> {
  await git(shell, cwd, ['restore', '--staged', '--', ...(path === undefined ? [] : [path])])
  return { ok: true }
}

export async function gitDiscard(shell: ShellExecutor, cwd: string, path: string): Promise<{ ok: true }> {
  await git(shell, cwd, ['checkout', '--', path])
  return { ok: true }
}

export async function gitCommit(shell: ShellExecutor, cwd: string, message: string): Promise<{ ok: true }> {
  if (message.trim() === '') throw new Error('Commit message must not be blank.')
  await git(shell, cwd, ['commit', '-m', message])
  return { ok: true }
}

export async function gitBranches(shell: ShellExecutor, cwd: string): Promise<{ current: string | null; names: readonly string[] }> {
  const out = await git(shell, cwd, ['branch', '--format=%(refname:short)%00%(HEAD)'])
  let current: string | null = null
  const names: string[] = []
  for (const frame of out.stdout.split('\0')) {
    if (frame === '') continue
    const [name, head] = frame.split('\n')
    if (head === '*') current = name ?? null
    if (name !== '') names.push(name ?? '')
  }
  return { current, names }
}

export async function gitCheckout(shell: ShellExecutor, cwd: string, branch: string): Promise<{ ok: true }> {
  await git(shell, cwd, ['checkout', branch])
  return { ok: true }
}

/** Content search through ripgrep when available; graceful empty result otherwise. */
export async function searchContent(
  shell: ShellExecutor, root: string, query: string,
): Promise<FsContentSearchResponse> {
  try {
    const out = await git(shell, root, ['--no-pager', 'grep', '-n', '-i', '--max-count', '200', '-e', query, '--', '.'])
    const matches = out.stdout.split('\n').filter(line => line !== '').map(line => {
      const colon = line.indexOf(':')
      if (colon < 0) return { path: line, line: 0, content: '' }
      const rest = line.slice(colon + 1)
      const colon2 = rest.indexOf(':')
      if (colon2 < 0) return { path: line.slice(0, colon), line: 0, content: rest }
      return { path: line.slice(0, colon), line: Number.parseInt(rest.slice(0, colon2), 10) || 0, content: rest.slice(colon2 + 1) }
    })
    return { matches, truncated: matches.length >= 200 }
  } catch {
    return { matches: [], truncated: false }
  }
}
