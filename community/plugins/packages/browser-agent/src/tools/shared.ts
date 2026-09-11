/**
 * 工具层共享依赖与动作封装：会话解析、命令执行、快照补拍与公共 schema
 * 辅助。所有工具都经过这里，保证「快照优先」与输出上限一致。
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { BskCommandRunner, BskOutcome } from '../host/bsk.js'
import { BskError, errorText, isStaleSessionError, NAVIGATION_TIMEOUT_MS } from '../host/bsk.js'
import type { BrowserPolicy } from '../host/policy.js'
import type { SnapshotPayload } from '../host/snapshot.js'
import type { BskSessionRecord, BskSessionStore } from '../host/store.js'

/** 工具层需要的部署配置（已解析）。 */
export interface BrowserToolConfig {
  /** 普通动作超时（毫秒）。 */
  actionTimeoutMs: number
  /** 导航类动作超时（毫秒）。 */
  navigationTimeoutMs: number
  /** 截图落盘目录；空串表示交给 bsk 默认临时目录。 */
  screenshotDir: string
  /** 借用用户标签页前是否必须取得审批。 */
  requireApprovalForBorrow: boolean
}

/** 宿主审批服务收到的请求（结构化面）。 */
export interface ApprovalRequestLike {
  agent: unknown
  toolName: string
  callId?: unknown
  reason?: string
  signal?: AbortSignal
}

/** 宿主审批结果。 */
export type ApprovalOutcomeLike = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

/** 宿主审批服务的结构化面；未挂载时为 undefined。 */
export interface ApprovalFace {
  request(request: ApprovalRequestLike): Promise<ApprovalOutcomeLike>
}

/** 工具层依赖集合。 */
export interface BrowserToolDeps {
  runner: BskCommandRunner
  store: BskSessionStore
  policy: BrowserPolicy
  config: BrowserToolConfig
  approval?: ApprovalFace | undefined
}

/** 结构化的 Agent 面（避免依赖宿主编排类型线）。 */
export interface AgentLike {
  session: { id: unknown }
}

/** 结构化的一次工具执行上下文。 */
export interface ExecLike {
  agent?: AgentLike | undefined
  signal: AbortSignal
}

/**
 * 取当前工具调用所属的 DSH 会话 id。
 * @param exec - 工具执行上下文
 * @returns DSH 会话 id
 */
export function requireSessionId(exec: ExecLike): string {
  const agent = exec.agent
  if (agent === undefined) throw new Error('浏览器工具需要在 Agent 会话中调用（当前调用没有归属会话）')
  return String(agent.session.id)
}

/** 文本内容块。 */
export function textBlock(text: string): ContentBlock[] {
  return [{ type: 'text', text }]
}

/**
 * 声明输出 schema 并保留字面量类型：`defineTool` 的输出泛型需要字面量
 * 才能推断出模型可见值的形状。
 * @param schema - 输出值 schema
 * @returns 同一字面量
 */
export function valueSchema<const T extends ValueSchemaSpec>(schema: T): T {
  return schema
}

/**
 * 注册一个模型工具，并把释放器绑定到当前 fiber。
 *
 * 仓库约定「注册即 effect」：即便注册表本身不绑定调用方 fiber，插件卸载 /
 * Cordis HMR 热替换时也必须把工具摘干净——否则重挂载会撞上重复工具名。
 * @param ctx - 当前插件上下文
 * @param definition - 工具定义
 */
export function registerTool(ctx: Context, definition: ToolDefinition): void {
  ctx.effect(() => ctx.tools.register(definition), `browser-agent:${definition.name}`)
}

/**
 * 执行一条带会话上下文的 bsk 命令。
 * @param deps - 工具依赖
 * @param sessionId - DSH 会话 id
 * @param args - bsk 参数（不含 `--session`）
 * @param options - 超时与取消
 * @returns 命令结果
 */
export async function runFor(
  deps: BrowserToolDeps,
  sessionId: string,
  args: readonly string[],
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<BskOutcome> {
  const record = await deps.store.ensure(sessionId)
  try {
    const outcome = await deps.runner.run([...args, '--session', record.bskSessionId], {
      timeoutMs: options.timeoutMs ?? deps.config.actionTimeoutMs,
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    })
    deps.store.update(sessionId, { lastError: null })
    return outcome
  } catch (error) {
    if (isStaleSessionError(error)) {
      deps.store.drop(sessionId, '会话已失效')
      throw new BskError('浏览器会话已失效（可能被外部结束或 daemon 重启），已重置；请重新用 browser_open 打开页面', {
        code: 'stale_session',
        hint: '下一次调用会自动新建会话，页面状态需要重新打开',
        exitCode: error.exitCode,
      })
    }
    deps.store.update(sessionId, { lastError: errorText(error) })
    throw error
  }
}

/** 一次快照的结果：会话运行态与规范化快照。 */
export interface SnapshotOutcome {
  record: BskSessionRecord
  snapshot: SnapshotPayload
}

/**
 * 拍一次 aria 快照并写入会话状态。
 * @param deps - 工具依赖
 * @param sessionId - DSH 会话 id
 * @param signal - 取消信号
 * @returns 会话运行态与快照
 */
export async function takeSnapshot(
  deps: BrowserToolDeps,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SnapshotOutcome> {
  const outcome = await runFor(deps, sessionId, ['snapshot', '--json'], {
    ...(signal !== undefined ? { signal } : {}),
  })
  const json = outcome.json ?? {}
  const snapshot = deps.store.recordSnapshot(sessionId, {
    text: typeof json['text'] === 'string' ? json['text'] : outcome.stdout,
    refCount: typeof json['ref_count'] === 'number' ? json['ref_count'] : 0,
    truncated: json['truncated'] === true,
  })
  const record = deps.store.get(sessionId)
  if (record === undefined) throw new Error('会话在快照期间被回收，请重试')
  return { record, snapshot }
}

/**
 * 写操作前保证引用新鲜：引用已失效时补拍一次快照。
 * @param deps - 工具依赖
 * @param sessionId - DSH 会话 id
 * @param signal - 取消信号
 * @returns 补拍的快照；引用本就新鲜时为 null
 */
export async function refreshRefs(
  deps: BrowserToolDeps,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SnapshotPayload | null> {
  const record = await deps.store.ensure(sessionId)
  if (!record.refsStale) return null
  const captured = await takeSnapshot(deps, sessionId, signal)
  return captured.snapshot
}

/**
 * 记录导航结果（URL）并把引用标记为失效。
 * @param deps - 工具依赖
 * @param sessionId - DSH 会话 id
 * @param outcome - 导航类命令结果
 */
export function recordNavigation(deps: BrowserToolDeps, sessionId: string, outcome: BskOutcome): void {
  const json = outcome.json ?? {}
  const finalUrl = json['final_url'] ?? json['url']
  deps.store.markRefsStale(sessionId)
  deps.store.update(sessionId, {
    currentUrl: typeof finalUrl === 'string' ? finalUrl : deps.store.get(sessionId)?.currentUrl ?? null,
  })
}

/** 导航类工具的超时取值。 */
export function navigationTimeout(deps: BrowserToolDeps): number {
  return Math.max(deps.config.navigationTimeoutMs, NAVIGATION_TIMEOUT_MS)
}

/**
 * 把毫秒转成 bsk 接受的时长写法（`30s` / `1500ms`）。
 * @param ms - 毫秒
 * @returns bsk 时长参数
 */
export function durationArg(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  return `${String(seconds)}s`
}
