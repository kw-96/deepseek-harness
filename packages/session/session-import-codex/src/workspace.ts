/** Codex 导入会话与 DSH 工作区成员关系的持久化。 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-workspace'

/**
 * 为导入会话创建或复用其 cwd 对应的工作区，并写入工作区成员关系。
 * 工作区失败不能撤销已经成功持久化的导入会话。
 * @param ctx 包含工作区注册表的运行时上下文。
 * @param sessionId 已持久化的导入会话标识。
 * @param cwd 会话头记录的工作目录；缺失时保持会话未分组。
 * @returns 成员关系成功写入，或记录失败后继续保留未分组会话。
 */
export async function attachCodexSessionWorkspace(
  ctx: Context,
  sessionId: SessionId,
  cwd: string | undefined,
): Promise<void> {
  if (cwd === undefined) return
  try {
    const workspace = await ctx.workspaceRegistry.create(cwd)
    await workspace.attachSession(sessionId)
  } catch (error) {
    ctx.logger.warn(`Codex 导入会话 ${JSON.stringify(sessionId)} 无法归入工作区 ${JSON.stringify(cwd)}：${String(error)}`)
  }
}
