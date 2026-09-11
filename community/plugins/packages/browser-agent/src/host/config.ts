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
  /**
   * 点击方式。
   *
   * - `pointer`（默认）：交给 `bsk click`，用 CDP 派发真实指针事件；
   * - `dom`：先 `bsk hover` 取元素坐标，再经 `bsk evaluate` 在页面上执行
   *   固定的 `element.click()`（表达式由插件生成，模型无法注入脚本），
   *   用于扩展浮层 `<browser-skill-overlay>` 吞掉指针点击时的过渡场景。
   */
  clickMode: 'pointer' | 'dom'
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
  clickMode: 'pointer',
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
  clickMode: z.union(['pointer', 'dom'] as const).default('pointer'),
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

/** 一个活跃 bsk 会话的运行态。 */
export interface BskSessionRecord {
  bskSessionId: string
  windowId: string | null
  startedAtMs: number
  lastActionAtMs: number
  currentUrl: string | null
  pageTitle: string | null
  /** 上一次快照的引用是否已失效（导航或 DOM 变化后置位）。 */
  refsStale: boolean
  tabCount: number
  lastScreenshotPath: string | null
  lastError: string | null
}

/** 会话托管配置。 */
export interface SessionStoreOptions {
  /** 空闲多久后自动结束会话（毫秒）。 */
  idleTimeoutMs: number
  /** 快照输出字符上限。 */
  snapshotMaxChars: number
  /** 目标浏览器实例（id 或 label）；空串表示要求唯一实例。 */
  browserInstance: string
  /**
   * 宿主会话是否仍然存在。返回 false 时该记录会被回收：会话 id 失效后
   * 再没有任何调用能替它 stop，否则只能等空闲巡检，期间会留下孤儿 Agent Window。
   */
  isOwnerAlive?: ((sessionId: string) => boolean) | undefined
  log: (message: string) => void
}
