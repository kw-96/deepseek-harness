/** gitTimeline Remote 的线上数据形态与本地类型。 */

import { z } from 'zod'

/** 一条提交：`git log` 的紧凑投影。 */
export const gitCommitValue = z.object({
  hash: z.string(),
  subject: z.string(),
  author: z.string(),
  /** `%ai` 格式的提交时间（含时区）。 */
  date: z.string(),
  /** `%D` 装饰（分支/标签），无引用时为空串。 */
  refs: z.string(),
}).readonly()

/** 一个工作区变更文件。 */
export const changedFileValue = z.object({
  path: z.string(),
  /** 重命名/复制的原路径；其余为 null。 */
  origPath: z.string().nullable(),
  /** porcelain 的两字符 XY 状态码。 */
  status: z.string(),
}).readonly()

export const gitLogValue = z.object({
  /** 目标目录是否位于 Git 仓库内。 */
  repo: z.boolean(),
  /** 仓库根（绝对路径，`/` 分隔）；非仓库时为 null。 */
  root: z.string().nullable(),
  /** 读取失败的原因（例如仓库尚无提交）；成功时为 null。 */
  error: z.string().nullable(),
  entries: z.array(gitCommitValue).readonly(),
}).readonly()

export const changedValue = z.object({
  repo: z.boolean(),
  root: z.string().nullable(),
  error: z.string().nullable(),
  files: z.array(changedFileValue).readonly(),
}).readonly()

/** 一条提交记录。 */
export interface GitCommit {
  hash: string
  subject: string
  author: string
  date: string
  refs: string
}

/** 一个变更文件。 */
export interface ChangedFile {
  path: string
  origPath: string | null
  status: string
}

/** `log` 的响应：仓库识别 + 提交列表（或失败说明）。 */
export interface GitLogResponse {
  repo: boolean
  root: string | null
  error: string | null
  entries: readonly GitCommit[]
}

/** `changed` 的响应：仓库识别 + 变更文件列表。 */
export interface ChangedResponse {
  repo: boolean
  root: string | null
  error: string | null
  files: readonly ChangedFile[]
}
