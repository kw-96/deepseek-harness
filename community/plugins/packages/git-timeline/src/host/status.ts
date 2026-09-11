/** 工作区状态、差异与身份：porcelain-v2 解析与只读读取。 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { GitDiffResponse, GitEntry, GitIdentity, GitStatusResponse } from '../types.js'
import { git, repoRoot } from './run.js'

/** porcelain-v2 的解析结果。 */
export interface PorcelainStatus {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  entries: GitEntry[]
}

/** 跳过 count 个空格分隔字段后返回剩余内容；字段不足返回空串。 */
function skipFields(text: string, count: number): string {
  let index = 0
  for (let field = 0; field < count; field += 1) {
    const space = text.indexOf(' ', index)
    if (space < 0) return ''
    index = space + 1
  }
  return text.slice(index)
}

/** 重命名路径拆成 [新路径, 原路径]；普通路径原路径为 null。 */
function splitRename(raw: string): [string, string | null] {
  const tab = raw.indexOf('\t')
  if (tab < 0) return [raw, null]
  return [raw.slice(tab + 1), raw.slice(0, tab)]
}

/**
 * 解析 `git status --porcelain=v2 --branch -z`。
 *
 * `-z` 下的重命名/复制条目把原路径放在**下一个 NUL 帧**（不是 TAB），
 * 因此这里按索引遍历并消费该帧。
 * @param raw 原始输出（`\0` 分帧）
 * @returns 分支/上下游与条目列表
 */
export function parsePorcelainV2(raw: string): PorcelainStatus {
  let branch: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const entries: GitEntry[] = []
  const frames = raw.split('\0')
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index] ?? ''
    if (frame === '') continue
    if (frame.startsWith('# branch.head ')) {
      const name = frame.slice('# branch.head '.length)
      branch = name === '(detached)' ? null : name || null
      continue
    }
    if (frame.startsWith('# branch.upstream ')) { upstream = frame.slice('# branch.upstream '.length) || null; continue }
    if (frame.startsWith('# branch.ab ')) {
      const match = /\+(\d+)(?: -(\d+))?/.exec(frame)
      ahead = match?.[1] === undefined ? 0 : Number(match[1])
      behind = match?.[2] === undefined ? 0 : Number(match[2])
      continue
    }
    if (frame.startsWith('1 ')) {
      // <kind> <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>：7 个字段后接路径。
      const rest = frame.slice(frame.indexOf(' ') + 1)
      entries.push({ path: skipFields(rest, 7), origPath: null, xy: rest.slice(0, 2) })
      continue
    }
    if (frame.startsWith('2 ')) {
      // 重命名/复制：多一个 <X><score> 字段，原路径在下一帧。
      const rest = frame.slice(frame.indexOf(' ') + 1)
      const field = skipFields(rest, 8)
      const [path, inlineOrig] = splitRename(field)
      const origPath = inlineOrig ?? (frames[index + 1] ?? '')
      if (inlineOrig === null) index += 1
      entries.push({ path, origPath: origPath === '' ? null : origPath, xy: rest.slice(0, 2) })
      continue
    }
    if (frame.startsWith('u ')) {
      const rest = frame.slice(frame.indexOf(' ') + 1)
      entries.push({ path: skipFields(rest, 10), origPath: null, xy: rest.slice(0, 2) })
      continue
    }
    if (frame.startsWith('? ')) { entries.push({ path: frame.slice(2), origPath: null, xy: '??' }); continue }
  }
  return { branch, upstream, ahead, behind, entries }
}

/**
 * 把条目拆成暂存侧与工作区侧：`??` 只算工作区，`MM` 两侧都算。
 * @param entries porcelain 条目
 */
export function splitEntries(entries: readonly GitEntry[]): { staged: GitEntry[]; changes: GitEntry[] } {
  const staged: GitEntry[] = []
  const changes: GitEntry[] = []
  for (const entry of entries) {
    if (entry.xy === '??') { changes.push(entry); continue }
    const [index, work] = [entry.xy.slice(0, 1), entry.xy.slice(1, 2)]
    if (index !== '.' && index !== ' ') staged.push(entry)
    if (work !== '.' && work !== ' ') changes.push(entry)
  }
  return { staged, changes }
}

/**
 * 读取工作区状态；非仓库与失败都以字段回传。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 */
export async function readStatus(shell: ShellExecutor, cwd: string): Promise<GitStatusResponse> {
  const root = await repoRoot(shell, cwd)
  const empty = { repo: false, root: null, branch: null, upstream: null, ahead: 0, behind: 0, staged: [], changes: [] }
  if (root === null) return { ...empty, error: null }
  try {
    const out = await git(shell, root, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'])
    const parsed = parsePorcelainV2(out.stdout)
    const { staged, changes } = splitEntries(parsed.entries)
    return {
      repo: true, root, error: null, branch: parsed.branch, upstream: parsed.upstream,
      ahead: parsed.ahead, behind: parsed.behind, staged, changes,
    }
  } catch (error) {
    return { ...empty, repo: true, root, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 读取差异文本（默认未暂存；`staged` 为真时读索引侧）。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @param options 目标路径、暂存侧与字节上限
 */
export async function readDiff(
  shell: ShellExecutor,
  cwd: string,
  options: { paths?: readonly string[]; staged?: boolean; maxBytes?: number } = {},
): Promise<GitDiffResponse> {
  const root = await repoRoot(shell, cwd)
  if (root === null) return { text: '', truncated: false }
  const maxBytes = options.maxBytes ?? 64 * 1024
  const args = ['diff', '--no-color', '--unified=3']
  if (options.staged === true) args.push('--cached')
  const paths = (options.paths ?? []).map(path => path.trim()).filter(path => path !== '')
  if (paths.length > 0) args.push('--', ...paths)
  const out = await git(shell, root, args)
  if (Buffer.byteLength(out.stdout, 'utf8') <= maxBytes) return { text: out.stdout, truncated: false }
  return { text: Buffer.from(out.stdout, 'utf8').subarray(0, maxBytes).toString('utf8'), truncated: true }
}

/**
 * 读取 git 身份（提交署名），用于面板底部账号显示。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 */
export async function readIdentity(shell: ShellExecutor, cwd: string): Promise<GitIdentity> {
  const read = async (key: string): Promise<string | null> => {
    try {
      const out = await git(shell, cwd, ['config', '--get', key])
      const value = out.stdout.trim()
      return value === '' ? null : value
    } catch {
      return null
    }
  }
  return { name: await read('user.name'), email: await read('user.email') }
}
