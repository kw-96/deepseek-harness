/** 提交历史：带父提交的 log 读取（供 Graph 泳道使用）。 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { GitCommit, GitLogResponse } from '../types.js'
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
