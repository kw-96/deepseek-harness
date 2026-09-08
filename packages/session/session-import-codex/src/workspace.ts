/** Codex 导入快照的持久化、会话发布与工作区归属对账。 */

import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-workspace'

/** 导入器为一个 Codex 线程生成的完整 DSH 快照。 */
export interface CodexImportSnapshot {
  readonly id: SessionId
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
  readonly title: string
}

/** 已存在 Codex 会话的本轮对账结果。 */
export type CodexImportReconcileKind = 'imported' | 'updated' | 'unchanged' | 'deferred-active'

/**
 * 将一个 Codex 快照写入 DSH，并维护当前 cwd 对应的唯一工作区成员关系。
 * 运行中的 Agent 会话不会在导入 sweep 中被替换，下一轮会继续对账。
 */
export class CodexImportReconciler {
  /** @param ctx 包含会话、持久化、Agent 与工作区服务的上下文。 */
  constructor(private readonly ctx: Context) {}

  /**
   * 创建、更新或确认一个导入快照。
   * @param snapshot Codex 当前线程转换出的完整快照。
   * @returns 导入、更新、无变化或因活跃 Agent 延后的结果。
   */
  async reconcile(snapshot: CodexImportSnapshot): Promise<CodexImportReconcileKind> {
    let stored
    try {
      stored = await this.ctx.sessionPersistence.stat(snapshot.id)
    } catch {
      await this.writeNew(snapshot)
      await this.reconcileWorkspace(snapshot.id, snapshot.header.cwd)
      return 'imported'
    }
    if (stored === undefined) {
      await this.writeNew(snapshot)
      await this.reconcileWorkspace(snapshot.id, snapshot.header.cwd)
      return 'imported'
    }
    const reader = await this.ctx.sessionPersistence.open(snapshot.id, 'read')
    let events: readonly SessionEvent[]
    try {
      events = await reader.read()
    } finally {
      await reader.close()
    }
    if (isDeepStrictEqual(stored.header, snapshot.header) && isDeepStrictEqual(events, snapshot.events)) {
      await this.reconcileWorkspace(snapshot.id, snapshot.header.cwd)
      return 'unchanged'
    }
    if (this.ctx.get('agents')?.get(snapshot.id) !== undefined) return 'deferred-active'

    await this.ctx.sessionPersistence.replace(snapshot.header, snapshot.events)
    // 仅当该会话已在 live store 时同步内存快照；冷会话只写持久化，
    // 避免把无 Agent 的导入会话塞进 store，进而让后续 resume 撞上
    // `session already exists`。
    if (this.ctx.sessions.get(snapshot.id) !== undefined) {
      this.ctx.sessions.replace(snapshot.id, {
        seed: structuredClone(snapshot.events),
        meta: {
          ...(snapshot.header.cwd === undefined ? {} : { cwd: snapshot.header.cwd }),
          createdAt: snapshot.header.createdAt,
          isSeeded: false,
        },
      })
    }
    await this.reconcileWorkspace(snapshot.id, snapshot.header.cwd)
    return 'updated'
  }

  private async writeNew(snapshot: CodexImportSnapshot): Promise<void> {
    const handle = await this.ctx.sessionPersistence.create(snapshot.header)
    try {
      await handle.append(snapshot.events)
      await handle.flush()
    } finally {
      await handle.close()
    }
  }

  private async reconcileWorkspace(sessionId: SessionId, cwd: string | undefined): Promise<void> {
    if (cwd === undefined) return
    try {
      const target = await this.ctx.workspaceRegistry.create(cwd)
      for (const workspace of this.ctx.workspaceRegistry.list()) {
        if (workspace.id !== target.id) await workspace.detachSession(sessionId)
      }
      await target.attachSession(sessionId)
    } catch (error) {
      this.ctx.logger.warn(`Codex 导入会话 ${JSON.stringify(sessionId)} 无法对账工作区 ${JSON.stringify(cwd)}：${String(error)}`)
    }
  }
}

/**
 * 为导入会话创建或复用其 cwd 对应的工作区，并写入成员关系。
 * @param ctx 包含工作区注册表的运行时上下文。
 * @param sessionId 已持久化的导入会话标识。
 * @param cwd 会话头记录的工作目录；缺失时保持会话未分组。
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
