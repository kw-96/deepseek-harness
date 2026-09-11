/** gitPanel Remote 的线上数据形态与本地类型。 */

import { z } from 'zod'

/** 一条 porcelain-v2 状态条目（重命名带原路径）。 */
export const gitEntryValue = z.object({
  path: z.string(),
  origPath: z.string().nullable(),
  /** 两字符 XY 状态码。 */
  xy: z.string(),
}).readonly()

/** 一条提交（图视图需要的父提交一并带出）。 */
export const gitCommitValue = z.object({
  hash: z.string(),
  shortHash: z.string(),
  /** 父提交哈希；合并提交有多个。 */
  parents: z.array(z.string()).readonly(),
  subject: z.string(),
  author: z.string(),
  /** `%ai` 格式的提交时间。 */
  date: z.string(),
  /** `%D` 装饰（分支/标签）。 */
  refs: z.string(),
}).readonly()

export const gitStatusValue = z.object({
  repo: z.boolean(),
  root: z.string().nullable(),
  error: z.string().nullable(),
  /** 当前分支名（detached HEAD 时为 null）。 */
  branch: z.string().nullable(),
  upstream: z.string().nullable(),
  ahead: z.number(),
  behind: z.number(),
  staged: z.array(gitEntryValue).readonly(),
  changes: z.array(gitEntryValue).readonly(),
}).readonly()

export const gitLogValue = z.object({
  repo: z.boolean(),
  root: z.string().nullable(),
  error: z.string().nullable(),
  entries: z.array(gitCommitValue).readonly(),
}).readonly()

export const gitDiffValue = z.object({ text: z.string(), truncated: z.boolean() }).readonly()
export const gitCommitFileValue = z.object({
  path: z.string(),
  origPath: z.string().nullable(),
  /** 单字母状态（A/M/D/T/R/C）。 */
  status: z.string(),
}).readonly()
export const gitCommitDetailValue = z.object({
  repo: z.boolean(),
  root: z.string().nullable(),
  error: z.string().nullable(),
  commit: gitCommitValue.nullable(),
  files: z.array(gitCommitFileValue).readonly(),
}).readonly()
export const gitMessageTextValue = z.object({ message: z.string() }).readonly()
export const gitBranchesValue = z.object({
  repo: z.boolean(),
  /** 本地分支名（按最近提交时间倒序）。 */
  names: z.array(z.string()).readonly(),
  error: z.string().nullable(),
}).readonly()
export const gitIdentityValue = z.object({ name: z.string().nullable(), email: z.string().nullable() }).readonly()
export const gitActionValue = z.object({ detail: z.string() }).readonly()
export const gitCommitResultValue = z.object({ shortHash: z.string().nullable(), detail: z.string() }).readonly()
export const gitMessageValue = z.object({
  message: z.string(),
  provider: z.string(),
  model: z.string(),
}).readonly()

/** 一条工作区状态条目。 */
export interface GitEntry {
  path: string
  origPath: string | null
  xy: string
}

/** 一条提交记录（含父提交，供泳道图使用）。 */
export interface GitCommit {
  hash: string
  shortHash: string
  parents: readonly string[]
  subject: string
  author: string
  date: string
  refs: string
}

export interface GitStatusResponse {
  repo: boolean
  root: string | null
  error: string | null
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  staged: readonly GitEntry[]
  changes: readonly GitEntry[]
}

export interface GitLogResponse {
  repo: boolean
  root: string | null
  error: string | null
  entries: readonly GitCommit[]
}

export interface GitDiffResponse { text: string; truncated: boolean }

/** 一条提交里被改动的文件（单字母状态）。 */
export interface GitCommitFile {
  path: string
  origPath: string | null
  status: string
}

/** 一条提交的详情：元信息 + 改动文件清单。 */
export interface GitCommitDetail {
  repo: boolean
  root: string | null
  error: string | null
  commit: GitCommit | null
  files: readonly GitCommitFile[]
}

/** 上一条提交的完整信息（`提交(修改)` 预填用）。 */
export interface GitMessageText { message: string }

/** 本地分支清单。 */
export interface GitBranches {
  repo: boolean
  names: readonly string[]
  error: string | null
}

export interface GitIdentity { name: string | null; email: string | null }

/** 写操作回执：`detail` 是给界面用的简短说明（多为 git 输出的尾行）。 */
export interface GitActionResponse { detail: string }

export interface GitCommitResponse { shortHash: string | null; detail: string }

/** 模型生成的提交信息与它使用的路由。 */
export interface GitMessageResponse { message: string; provider: string; model: string }
