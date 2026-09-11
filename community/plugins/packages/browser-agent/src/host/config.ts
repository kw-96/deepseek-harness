/**
 * 插件配置：全部可变行为都在这里声明，部署方通过 cordis.yml 覆盖，
 * 代码里不留隐藏默认值。
 */

import z from '@deepseek-ai/schemastery'
import { DEFAULT_SENSITIVE_PATTERNS } from './policy.js'

/** 插件配置。 */
export interface BrowserAgentConfig {
  /** bsk 可执行文件名或绝对路径。 */
  binary: string
  /** 目标浏览器实例（instance id 或 label）；空串表示要求唯一实例。 */
  browserInstance: string
  /** bsk 子进程工作目录。 */
  workspaceRoot: string
  /** 空闲多久后自动结束会话（毫秒）。 */
  idleTimeoutMs: number
  /** 普通动作超时（毫秒）。 */
  actionTimeoutMs: number
  /** 导航类动作超时（毫秒）。 */
  navigationTimeoutMs: number
  /** 单次快照返回给模型的字符上限。 */
  snapshotMaxChars: number
  /** 截图落盘目录；空串交给 bsk 的默认临时目录。 */
  screenshotDir: string
  /** 是否允许 evaluate（默认关闭）。 */
  allowEvaluate: boolean
  /** 借用用户标签页前是否必须取得审批（默认开启）。 */
  requireApprovalForBorrow: boolean
  /** 敏感站点关键词（凭据面）。 */
  sensitivePatterns: string[]
  /** 非空时限制导航范围。 */
  allowedPatterns: string[]
}

/** 配置默认值。 */
export const CONFIG_DEFAULTS: BrowserAgentConfig = {
  binary: 'bsk',
  browserInstance: '',
  workspaceRoot: process.cwd(),
  idleTimeoutMs: 600_000,
  actionTimeoutMs: 30_000,
  navigationTimeoutMs: 60_000,
  snapshotMaxChars: 24_000,
  screenshotDir: '',
  allowEvaluate: false,
  requireApprovalForBorrow: true,
  sensitivePatterns: [...DEFAULT_SENSITIVE_PATTERNS],
  allowedPatterns: [],
}

/** cordis.yml 里使用的配置 schema。 */
export const BrowserAgentConfigSchema: z<BrowserAgentConfig> = z.object({
  binary: z.string().default('bsk'),
  browserInstance: z.string().default(''),
  workspaceRoot: z.string().default(process.cwd()),
  idleTimeoutMs: z.number().default(600_000),
  actionTimeoutMs: z.number().default(30_000),
  navigationTimeoutMs: z.number().default(60_000),
  snapshotMaxChars: z.number().default(24_000),
  screenshotDir: z.string().default(''),
  allowEvaluate: z.boolean().default(false),
  requireApprovalForBorrow: z.boolean().default(true),
  sensitivePatterns: z.array(z.string()).default([...DEFAULT_SENSITIVE_PATTERNS]),
  allowedPatterns: z.array(z.string()).default([]),
})

/**
 * 合并默认值与部署覆盖，供非 Loader 场景（测试、直接构造）使用。
 * @param partial - 部署方给出的部分配置
 * @returns 完整配置
 */
export function resolveConfig(partial: Partial<BrowserAgentConfig> = {}): BrowserAgentConfig {
  return { ...CONFIG_DEFAULTS, ...partial }
}
