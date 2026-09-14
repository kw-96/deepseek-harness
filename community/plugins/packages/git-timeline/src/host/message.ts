/**
 * 用当前会话的模型生成提交信息。
 *
 * 路由取自会话日志里最后一条 `request/header`（`session.requestHeader().config`），
 * 因此用的就是「当前会话正在使用的模型」；这是一次性辅助请求，不写回会话转写。
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  BlockAssembler, createUserMessage, ReasoningEffortId, type ContentBlock, type GenerateOptions, type Message,
} from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { GitMessageResponse } from '../types.js'
import { readDiff, readStatus } from './status.js'

/** 送进模型的差异字节上限。 */
const MAX_DIFF_BYTES = 24 * 1024
/**
 * 生成的最大 token 数。
 *
 * 必须为正文留足预算：会话默认可能把推理开在最高档，而推理与正文共享这一
 * 上限，预算不足时正文会整段缺失。
 */
const MAX_OUTPUT_TOKENS = 2048

/** 本插件读取的 Agent / Session / LLM 结构面。 */
interface SessionFace {
  /** 会话标识：直接沿用 GenerateOptions 要求的品牌类型，避免跨包品牌转换。 */
  readonly id: NonNullable<GenerateOptions['sessionId']>
  requestHeader(): { readonly config?: { readonly provider?: string; readonly model?: string } } | undefined
}
interface AgentsFace { get(id: SessionId): { readonly session: SessionFace } | undefined }
interface LlmFace { stream(options: GenerateOptions): AsyncIterable<Parameters<BlockAssembler['push']>[0]> }

const SYSTEM_PROMPT = [
  '你是 Git 提交信息助手。根据给定的改动文件与差异，写一条可以直接使用的提交信息。',
  '用简体中文；第一行是祈使句主题，不超过 72 个字符、结尾不加句号；',
  '改动较多时另起一段补 2-4 条「- 」要点；',
  '只输出提交信息本身：不要解释、不要 Markdown 代码块、不要引号。',
].join('\n')

/** 组装送进模型的改动描述。 */
function buildInput(
  branch: string | null,
  staged: boolean,
  paths: readonly string[],
  diff: string,
  truncated: boolean,
): string {
  return [
    `当前分支：${branch ?? '(detached HEAD)'}`,
    `改动文件（${staged ? '已暂存' : '未暂存'}，共 ${String(paths.length)} 个）：`,
    paths.map(path => `- ${path}`).join('\n'),
    truncated ? '差异（已截断）：' : '差异：',
    diff.trim() === '' ? '(无文本差异，可能是新增或删除文件)' : diff,
  ].join('\n')
}

/** 一次生成里出现过的块类型统计。 */
function describeBlocks(blocks: readonly ContentBlock[]): string {
  const counts = new Map<string, number>()
  for (const block of blocks) counts.set(block.type, (counts.get(block.type) ?? 0) + 1)
  if (counts.size === 0) return '没有任何内容块'
  return [...counts].map(([type, count]) => `${type}×${String(count)}`).join('、')
}

/**
 * 把拼装结果收敛成提交信息文本。
 *
 * 正文为空时报错必须说明实际返回了什么：会话默认可能把推理开在最高档，
 * 推理占满输出预算时正文会整段缺失，只报「没有文本」无法定位。
 * @param assembler 一次生成的块拼装器
 * @returns 提交信息文本
 */
export function readText(assembler: BlockAssembler): string {
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') throw new Error(finish.failure.message)
  const blocks = assembler.blocks()
  const text = blocks
    .map(block => (block.type === 'text' ? block.text : ''))
    .filter(part => part !== '')
    .join('\n')
    .trim()
  if (text === '') {
    // 说明实际返回了什么：只有推理块时最可能是推理占满了输出预算。
    throw new Error(`模型没有返回提交信息文本（本次返回：${describeBlocks(blocks)}）`)
  }
  return text
}

/**
 * 生成一条提交信息。
 * @param ctx 宿主上下文（需要 llm 与 agents 服务）
 * @param shell shell 执行器
 * @param sessionId 当前会话
 * @param cwd 会话工作目录
 * @returns 提交信息与所用路由
 */
export async function generateCommitMessage(
  ctx: Context,
  shell: ShellExecutor,
  sessionId: string,
  cwd: string,
): Promise<GitMessageResponse> {
  const agents = ctx.get('agents') as AgentsFace | undefined
  const session = agents?.get(SessionId(sessionId))?.session
  if (session === undefined) throw new Error('需要当前会话的 live Agent 才能生成提交信息')
  const config = session.requestHeader()?.config
  const provider = config?.provider
  const model = config?.model
  if (provider === undefined || model === undefined) {
    throw new Error('当前会话还没有模型路由记录，先在对话里发一条消息再试')
  }
  const status = await readStatus(shell, cwd)
  if (!status.repo) throw new Error('当前工作区不是 Git 仓库')
  const staged = status.staged.length > 0
  const paths = (staged ? status.staged : status.changes).map(entry => entry.path)
  if (paths.length === 0) throw new Error('没有可提交的改动')
  const diff = await readDiff(shell, cwd, { staged, maxBytes: MAX_DIFF_BYTES })

  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: buildInput(status.branch, staged, paths, diff.text, diff.truncated) }],
    source: { kind: 'plugin', plugin: 'dsh-git-timeline' },
  })]
  const options: GenerateOptions = {
    provider,
    model,
    messages,
    system: SYSTEM_PROMPT,
    maxTokens: MAX_OUTPUT_TOKENS,
    // 关掉推理：会话默认可能开在最高档，推理与正文共享输出上限，正文会整段缺失；
    // 一次性的提交信息生成不需要推理。
    reasoningEffort: ReasoningEffortId('off'),
    sessionId: session.id,
  }
  const llm = ctx.get('llm') as LlmFace | undefined
  if (llm === undefined) throw new Error('宿主未挂载 llm 服务')
  const assembler = new BlockAssembler()
  for await (const chunk of llm.stream(options)) assembler.push(chunk)
  return { message: readText(assembler), provider, model }
}
