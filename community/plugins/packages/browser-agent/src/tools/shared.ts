/**
 * 工具层的共享类型与微辅助：部署配置、依赖集合、宿主结构化面与内容块辅助。
 * 动作封装（命令执行、快照补拍、引用刷新）在 actions.ts。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { ActionTracker } from '../host/live/tracker.js'
import { sessionKey } from '../host/session/keys.js'
import type { ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { ImageRefLike, SaveImageInput } from '../host/attachment.js'
import type { BskCommandRunner } from '../host/bsk.js'
import type { BrowserPolicy } from '../host/policy.js'
import type { BskSessionStore } from '../host/store.js'

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
  /** 点击方式：pointer 用 CDP 指针事件，dom 用固定表达式执行 element.click()。 */
  clickMode: 'pointer' | 'dom'
}

export type { ImageRefLike, SaveImageInput }

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
  /**
   * 把截图字节提交到宿主附件库，返回可内联进模型上下文的引用。
   * 宿主未挂载附件库、字节类型不认识、超出限额或当前模型路由不接受图像
   * 输入时返回 undefined —— 此时工具结果退回「只给文件路径」。
   */
  saveImage?: ((input: SaveImageInput) => Promise<ImageRefLike | undefined>) | undefined
  /** 实时动作跟踪：面板据此显示「正在做什么」并支持中断。 */
  tracker?: ActionTracker | undefined
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
 * 本次调用解析出的会话键（多会话下是复合键）。
 *
 * 包装器在调用前写入，工具层只读——这样 17 个工具都不必自己拼键，
 * 也不必知道别名是怎么解析成复合键的。
 */
const sessionKeyByExec = new WeakMap<object, string>()

/**
 * 记录本次调用的会话键。
 * @param exec - 本次调用传给工具的上下文
 * @param key - 复合键
 */
export function setSessionKey(exec: object, key: string): void {
  sessionKeyByExec.set(exec, key)
}

/**
 * 取当前工具调用应作用在哪个 bsk 会话上。
 * @param exec - 工具执行上下文
 * @returns 会话键（默认会话即 DSH 会话 id，多会话为 `<dshId>##<alias>`）
 */
export function requireSessionId(exec: ExecLike): string {
  const agent = exec.agent
  if (agent === undefined) throw new Error('浏览器工具需要在 Agent 会话中调用（当前调用没有归属会话）')
  return sessionKeyByExec.get(exec as object) ?? String(agent.session.id)
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

/** 等待条件取值。 */
const WAIT_UNTIL = ['load', 'domcontentloaded', 'networkidle', 'commit'] as const

export const observeSchema = valueSchema({
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: { type: 'string', required: true, enum: ['snapshot', 'screenshot', 'html'] },
    url: { type: 'string', required: true },
    title: { type: 'string', required: true },
    bskSessionId: { type: 'string', required: true },
    refs: { type: 'integer', required: true },
    truncated: { type: 'boolean', required: true },
    note: { type: 'string', required: true },
    content: { type: 'string', required: true },
    screenshotPath: { type: 'string', required: true },
    screenshotBytes: { type: 'integer', required: true },
    screenshotSize: { type: 'string', required: true },
    // 仅当宿主挂了附件库且当前路由接受图像输入时出现；出现时 render 追加 image 内容块。
    image: {
      type: 'object',
      additionalProperties: false,
      properties: {
        attachmentId: { type: 'string', required: true },
        mediaType: { type: 'string', required: true, enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
        bytes: { type: 'integer', required: true },
        width: { type: 'integer', required: true },
        height: { type: 'integer', required: true },
      },
    },
  },
})

/**
 * 所有浏览器工具共享的 `session` 参数：不传即当前活跃会话。
 * 展开进各工具的 `parameters`，这样多会话支持不需要每个工具各写一遍。
 */
export const SESSION_PARAM = {
  session: {
    type: 'string' as const,
    description: 'Browser session alias (default: the active one). Use browser_session to list, create or switch.',
  },
}
