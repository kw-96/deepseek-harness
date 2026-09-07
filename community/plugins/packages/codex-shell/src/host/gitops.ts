/** Git operations behind the codexShell Remote, built on ctx.shell. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-shell'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { FsContentSearchResponse, FsSearchOptions, GitLogResponse, GitStatusResponse } from '../types.js'
import { grepPathspecs } from './globs.js'

const GIT_TIMEOUT_MS = 30_000
/** 网络类操作（fetch/pull/push）的超时上限。 */
const GIT_NETWORK_TIMEOUT_MS = 120_000

interface RunOutcome { exitCode: number | null; stdout: string; stderr: string }

/** Run one git command in a working directory; nonzero exits throw the stderr tail. */
async function git(shell: ShellExecutor, cwd: string, args: readonly string[], timeoutMs = GIT_TIMEOUT_MS): Promise<RunOutcome> {
  const quoted = args.map(arg => `'${String(arg).replaceAll("'", "'\\''")}'`).join(' ')
  const spec = shell.resolve({ command: `git ${quoted}`, workdir: cwd, timeoutMs, stdoutMaxBytes: 1024 * 1024 })
  const result = await shell.run(spec)
  if (result.exitCode !== 0) {
    const detail = result.stderr.text.trim() || result.stdout.text.trim() || `git exited ${String(result.exitCode)}`
    throw new Error(detail)
  }
  return { exitCode: result.exitCode, stdout: result.stdout.text, stderr: result.stderr.text }
}

/** 一条 porcelain-v2 状态条目（重命名带原路径）。 */
export interface PorcelainEntry { path: string; origPath: string | null; xy: string }

/** porcelain-v2 解析结果：分支/上下游计数 + 条目列表。 */
export interface PorcelainStatus {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  entries: PorcelainEntry[]
}

/** 重命名路径拆分为 [新路径, 原路径]；普通路径原路径为 null。 */
function splitRename(pathRaw: string): [string, string | null] {
  const tab = pathRaw.indexOf('\t')
  if (tab < 0) return [pathRaw, null]
  return [pathRaw.slice(tab + 1), pathRaw.slice(0, tab)]
}

/** 跳过 count 个空格分隔字段后返回剩余内容；字段不足返回空串。 */
function skipFields(text: string, count: number): string {
  let index = 0
  for (let field = 0; field < count; field++) {
    const space = text.indexOf(' ', index)
    if (space < 0) return ''
    index = space + 1
  }
  return text.slice(index)
}

/**
 * 把 `git status --porcelain=v2 -z --branch` 输出解析成结构化状态。
 * 覆盖三类条目帧（`1 `/`2 `/`u ` 变更与未合并、`? ` 未跟踪），并读取
 * `# branch.head/upstream/ab` 头帧。
 * @param raw 原始输出（含 \0 分帧）
 * @returns 结构化状态
 */
export function parsePorcelainV2(raw: string): PorcelainStatus {
  let branch: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const entries: PorcelainEntry[] = []
  for (const frame of raw.split('\0')) {
    if (frame === '') continue
    if (frame.startsWith('# branch.head ')) { branch = frame.slice('# branch.head '.length) || null; continue }
    if (frame.startsWith('# branch.upstream ')) { upstream = frame.slice('# branch.upstream '.length) || null; continue }
    if (frame.startsWith('# branch.ab ')) {
      const match = /\+(\d+)(?: -(\d+))?/.exec(frame)
      ahead = match?.[1] === undefined ? 0 : Number(match[1])
      behind = match?.[2] === undefined ? 0 : Number(match[2])
      continue
    }
    if (frame.startsWith('1 ')) {
      // 帧结构：<kind> <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>，共 7 个字段后接路径。
      const rest = frame.slice(frame.indexOf(' ') + 1)
      const [path, origPath] = splitRename(skipFields(rest, 7))
      entries.push({ path, origPath, xy: rest.slice(0, 2) })
    } else if (frame.startsWith('2 ')) {
      // 重命名/复制帧在 hI 后多一个 <X><score> 相似度字段，共 8 个字段。
      const rest = frame.slice(frame.indexOf(' ') + 1)
      const [path, origPath] = splitRename(skipFields(rest, 8))
      entries.push({ path, origPath, xy: rest.slice(0, 2) })
    } else if (frame.startsWith('u ')) {
      // 未合并帧：<XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>，共 9 个字段。
      const rest = frame.slice(frame.indexOf(' ') + 1)
      const [path, origPath] = splitRename(skipFields(rest, 9))
      entries.push({ path, origPath, xy: rest.slice(0, 2) })
    } else if (frame.startsWith('?')) {
      entries.push({ path: frame.slice(2).replace(/^\s+/, ''), origPath: null, xy: '??' })
    }
  }
  return { branch, upstream, ahead, behind, entries }
}

/** Porcelain-v2 status with -z framing. */
export async function gitStatus(shell: ShellExecutor, cwd: string): Promise<GitStatusResponse> {
  let out: RunOutcome
  try {
    out = await git(shell, cwd, ['status', '--porcelain=v2', '-z', '--branch'])
  } catch {
    // Not a repository: report as such instead of failing.
    return { isRepo: false, branch: null, upstream: null, ahead: 0, behind: 0, entries: [] }
  }
  return { isRepo: true, ...parsePorcelainV2(out.stdout) }
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

/** 抓取全部远程（含清理已删除的远端分支）。 */
export async function gitFetch(shell: ShellExecutor, cwd: string): Promise<{ ok: true }> {
  await git(shell, cwd, ['fetch', '--all', '--prune'], GIT_NETWORK_TIMEOUT_MS)
  return { ok: true }
}

/** 拉取并 fast-forward 合并当前分支。 */
export async function gitPull(shell: ShellExecutor, cwd: string): Promise<{ ok: true }> {
  await git(shell, cwd, ['pull', '--ff-only'], GIT_NETWORK_TIMEOUT_MS)
  return { ok: true }
}

/** 推送当前分支到已配置的上游。 */
export async function gitPush(shell: ShellExecutor, cwd: string): Promise<{ ok: true }> {
  await git(shell, cwd, ['push'], GIT_NETWORK_TIMEOUT_MS)
  return { ok: true }
}

/** 暂存全部改动（含未跟踪文件）。 */
export async function gitStageAll(shell: ShellExecutor, cwd: string): Promise<{ ok: true }> {
  await git(shell, cwd, ['add', '-A'])
  return { ok: true }
}

/** 取消全部暂存（索引重置回 HEAD）。 */
export async function gitUnstageAll(shell: ShellExecutor, cwd: string): Promise<{ ok: true }> {
  await git(shell, cwd, ['reset', '-q'])
  return { ok: true }
}

/**
 * 通过 `git grep` 做内容搜索；失败时返回空结果。
 * @param shell shell 执行器
 * @param root 仓库工作目录
 * @param query 搜索串
 * @param options 大小写/整词/正则与路径过滤
 */
export async function searchContent(
  shell: ShellExecutor, root: string, query: string, options?: FsSearchOptions,
): Promise<FsContentSearchResponse> {
  if (query.trim() === '') return { matches: [], truncated: false }
  const flags: string[] = ['--no-pager', 'grep', '-n', '--max-count', '200']
  if (options?.matchCase !== true) flags.push('-i')
  if (options?.matchWholeWord === true) flags.push('-w')
  flags.push(options?.useRegex === true ? '-E' : '-F', '-e', query, '--', ...grepPathspecs(options?.include, options?.exclude))
  try {
    const out = await git(shell, root, flags)
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
