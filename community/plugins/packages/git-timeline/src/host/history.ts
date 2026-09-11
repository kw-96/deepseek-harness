/** 提交历史：带父提交的 log 读取（供 Graph 泳道使用）。 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { GitCommit, GitCommitDetail, GitCommitFile, GitLogResponse, GitMessageText } from '../types.js'
import { git, repoRoot } from './run.js'

/** 一次拉取的条数上限。 */
const MAX_LIMIT = 400
/** 字段分隔符（US，控制字符，不会出现在提交文本里）。 */
const SEP = '\x1f'

/**
 * 解析 `--format=%h%x1f%H%x1f%P%x1f%s%x1f%an%x1f%ai%x1f%D` 的输出。
 * @param raw 原始 stdout
 * @returns 提交列表
 */
export function parseLog(raw: string): GitCommit[] {
  const entries: GitCommit[] = []
  for (const line of raw.split('\n')) {
    if (line === '') continue
    const [shortHash, hash, parents, subject, author, date, refs] = line.split(SEP)
    entries.push({
      shortHash: shortHash ?? '',
      hash: hash ?? '',
      parents: (parents ?? '').split(' ').filter(parent => parent !== ''),
      subject: subject ?? '',
      author: author ?? '',
      date: date ?? '',
      refs: refs ?? '',
    })
  }
  return entries
}

/**
 * 读取提交历史。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @param limit 条数上限（默认 80）
 */
export async function readLog(shell: ShellExecutor, cwd: string, limit?: number): Promise<GitLogResponse> {
  const root = await repoRoot(shell, cwd)
  if (root === null) return { repo: false, root: null, error: null, entries: [] }
  const count = Math.max(1, Math.min(Math.trunc(limit ?? 80), MAX_LIMIT))
  try {
    const out = await git(shell, root, [
      'log', `-${String(count)}`, '--date=iso',
      `--format=%h${SEP}%H${SEP}%P${SEP}%s${SEP}%an${SEP}%ai${SEP}%D`,
    ])
    return { repo: true, root, error: null, entries: parseLog(out.stdout) }
  } catch (error) {
    // 空仓库（尚无提交）等可预期失败：仓库识别成功但历史读不到。
    return { repo: true, root, error: error instanceof Error ? error.message : String(error), entries: [] }
  }
}

/**
 * 读取上一条提交的完整信息（「提交(修改)」预填输入框）。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 */
export async function readLastMessage(shell: ShellExecutor, cwd: string): Promise<GitMessageText> {
  const root = await repoRoot(shell, cwd)
  if (root === null) return { message: '' }
  try {
    const out = await git(shell, root, ['log', '-1', '--format=%B'])
    return { message: out.stdout.replace(/\n+$/, '') }
  } catch {
    // 空仓库没有上一条提交：返回空信息即可。
    return { message: '' }
  }
}

/**
 * 解析 `diff-tree --name-status -z` 的 `状态\0路径\0…` 帧序列。
 *
 * 重命名/复制会多带一个原路径帧（`R100\0旧\0新\0`）；本插件不传 `-M`，
 * 正常只会出现 A/M/D/T，这里仍按完整语义解析。
 * @param raw 原始输出
 * @returns 改动文件列表
 */
export function parseNameStatus(raw: string): GitCommitFile[] {
  const frames = raw.split('\0')
  const files: GitCommitFile[] = []
  for (let index = 0; index < frames.length; index += 1) {
    const status = frames[index] ?? ''
    if (status === '') continue
    const letter = status.slice(0, 1)
    const first = frames[index + 1] ?? ''
    if (letter === 'R' || letter === 'C') {
      files.push({ path: frames[index + 2] ?? '', origPath: first, status: letter })
      index += 2
      continue
    }
    files.push({ path: first, origPath: null, status: letter })
    index += 1
  }
  return files
}

/**
 * 读取一条提交的详情（元信息 + 改动文件清单），供 Graph 列表展开。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @param hash 提交哈希
 */
export async function readCommit(shell: ShellExecutor, cwd: string, hash: string): Promise<GitCommitDetail> {
  const root = await repoRoot(shell, cwd)
  const empty = { repo: false, root: null, commit: null, files: [] }
  if (root === null) return { ...empty, error: null }
  if (hash.trim() === '') return { ...empty, repo: true, root, error: '缺少提交哈希' }
  try {
    const [meta, nameStatus] = await Promise.all([
      git(shell, root, ['show', '--no-patch', `--format=%h${SEP}%H${SEP}%P${SEP}%s${SEP}%an${SEP}%ai${SEP}%D`, hash]),
      git(shell, root, ['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', hash]),
    ])
    const commit = parseLog(meta.stdout).at(0)
    return {
      repo: true, root, error: null,
      commit: commit ?? null,
      files: parseNameStatus(nameStatus.stdout),
    }
  } catch (error) {
    return { ...empty, repo: true, root, error: error instanceof Error ? error.message : String(error) }
  }
}
