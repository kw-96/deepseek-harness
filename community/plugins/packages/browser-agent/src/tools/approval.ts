/**
 * 借用用户标签页前的审批闸门：把「模型不得擅自接管用户窗口」这条红线
 * 交给宿主审批服务落地，部署方可用 requireApprovalForBorrow 关闭。
 */

import type { BrowserToolDeps, ExecLike } from './shared.js'

/**
 * 执行一次必须获批的操作；未获批时抛出说明性错误。
 * @param deps - 工具依赖
 * @param exec - 工具执行上下文（审批需要发起调用方的 Agent）
 * @param toolName - 记录审批归属的工具名
 * @param reason - 向用户解释为什么需要批准
 */
export async function requireApproval(
  deps: BrowserToolDeps,
  exec: ExecLike & { callId?: unknown },
  toolName: string,
  reason: string,
): Promise<void> {
  if (!deps.config.requireApprovalForBorrow) return
  const approval = deps.approval
  if (approval === undefined) {
    throw new Error(`${reason}：当前部署未挂载审批服务，已拒绝执行（如需放行请把 requireApprovalForBorrow 设为 false）`)
  }
  const outcome = await approval.request({
    agent: exec.agent,
    toolName,
    ...(exec.callId !== undefined ? { callId: exec.callId } : {}),
    reason,
    signal: exec.signal,
  })
  if (outcome !== 'allowed-once') {
    throw new Error(`${reason}：用户未批准（${outcome}）`)
  }
}
