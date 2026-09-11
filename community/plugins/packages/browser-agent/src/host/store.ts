/**
 * 会话托管：把每个 DSH 会话映射到一个或多个 bsk 会话（懒启动、引用新鲜度、空闲回收与收尾）。
 *
 * 多会话用一个**复合键**表达：`<dshId>##<alias>`；默认会话仍直接用 `<dshId>`，
 * 因此单会话路径的行为与历史完全一致。插件卸载或 DSH 会话结束时由调用方触发
 * stop，确保 Agent Window 不被遗留。
 */

import type { BskCommandRunner } from './bsk.js'
import { NAVIGATION_TIMEOUT_MS } from './bsk.js'
import type { BskSessionRecord, SessionStoreOptions } from './config.js'
import { aliasOf, dshSessionOf } from './session/keys.js'
import { AliasRegistry } from './session/alias.js'
import type { SessionEntry } from './session/list.js'
import { ownedSessionIds, sessionsOf } from './session/list.js'
import { startBskSession } from './session/start.js'
import type { SnapshotPayload } from './snapshot.js'
import { extractTitle, projectSnapshot } from './snapshot.js'
import type { ReclaimStore } from './sweep.js'
import { reapOrphaned, stopAllOf, stopEverything, sweepIdle } from './sweep.js'

/** 会话托管器。 */
export class BskSessionStore {
  private readonly records = new Map<string, BskSessionRecord>()
  /** 每个 DSH 会话当前活跃的别名；缺省即默认会话。 */
  private readonly aliases = new AliasRegistry()
  /** 目标浏览器实例；空串表示运行时要求唯一实例。 */
  private readonly browserInstance: string

  /**
   * @param runner - bsk 命令执行器
   * @param options - 空闲上限、浏览器实例与日志
   */
  constructor(private readonly runner: BskCommandRunner, private readonly options: SessionStoreOptions) {
    // 容忍未显式给出该字段的调用方：空值一律按「自动选择」处理，
    // 绝不能把 undefined 当作实例名透传到 argv。
    this.browserInstance = options.browserInstance?.trim() ?? ''
  }

  /**
   * 取回或懒启动该 DSH 会话对应的 bsk 会话。
   * @param sessionId - DSH 会话 id
   * @returns 会话运行态
   */
  async ensure(key: string): Promise<BskSessionRecord> {
    const existing = this.records.get(key)
    if (existing !== undefined) return existing
    const record = await startBskSession(this.runner, this.browserInstance, key)
    this.records.set(key, record)
    this.options.log(`browser-agent: 已为会话 ${key} 启动 bsk 会话 ${record.bskSessionId}`)
    return record
  }
  /**
   * 读取会话运行态。
   * @param sessionId - DSH 会话 id
   * @returns 运行态，或 undefined
   */
  get(sessionId: string): BskSessionRecord | undefined {
    return this.records.get(sessionId)
  }

  /**
   * 更新会话运行态并刷新活动时间。
   * @param sessionId - DSH 会话 id
   * @param patch - 需要合并的字段
   */
  update(sessionId: string, patch: Partial<BskSessionRecord>): void {
    const record = this.records.get(sessionId)
    if (record === undefined) return
    Object.assign(record, patch, { lastActionAtMs: Date.now() })
  }

  /**
   * 标记引用失效（导航、点击跳转或任何 DOM 结构变化后调用）。
   * @param sessionId - DSH 会话 id
   */
  markRefsStale(sessionId: string): void {
    this.update(sessionId, { refsStale: true })
  }

  /**
   * 本插件当前持有的 bsk 会话 id（用于诊断与「非本插件会话」识别）。
   * @returns bsk 会话 id 列表
   */
  ownedSessionIds(): string[] {
    return ownedSessionIds(this.records.values())
  }

  /** 设置某个 DSH 会话的活跃别名（`browser_session use` 用）。 */
  setActiveAlias(dshSessionId: string, alias: string): void {
    this.aliases.set(dshSessionId, alias)
  }

  /** 取某个 DSH 会话当前活跃的复合键。 */
  activeKey(dshSessionId: string): string {
    return this.aliases.activeKey(dshSessionId)
  }

  /** 列出某个 DSH 会话名下的会话（活跃的在前）。 */
  sessionsOf(dshSessionId: string): SessionEntry[] {
    return sessionsOf(this.records, dshSessionId, this.activeKey(dshSessionId))
  }
  /**
   * 丢弃一个已失效的会话记录（不调用 bsk——会话本身已经不存在）。
   * @param sessionId - DSH 会话 id
   * @param reason - 诊断原因
   * @returns 是否确实丢弃了记录
   */
  drop(sessionId: string, reason: string): boolean {
    const existed = this.records.delete(sessionId)
    if (existed) this.options.log(`browser-agent: 丢弃失效会话 ${sessionId}（${reason}）`)
    return existed
  }

  /**
   * 结束一个会话并清理记录。
   * @param sessionId - DSH 会话 id
   * @param reason - 触发原因（写入诊断日志）
   * @returns 是否实际结束了会话
   */
  async stop(sessionId: string, reason: string): Promise<boolean> {
    const record = this.records.get(sessionId)
    if (record === undefined) return false
    this.records.delete(sessionId)
    try {
      await this.runner.run(['session', 'stop', record.bskSessionId, '--json'], { allowFailure: true })
      this.options.log(`browser-agent: 结束 bsk 会话 ${record.bskSessionId}（${reason}）`)
      return true
    } catch (error) {
      this.options.log(`browser-agent: 结束 bsk 会话失败：${String(error)}`)
      return false
    }
  }

  /** 结束本插件启动的全部会话（插件卸载时的兜底）。 */
  async stopAll(reason: string): Promise<void> {
    await stopEverything(this.reclaim(), reason)
  }

  /**
   * 结束某个 DSH 会话名下的全部 bsk 会话（含所有别名）。
   * @param dshSessionId - DSH 会话 id
   * @param reason - 触发原因
   * @returns 被结束的复合键
   */
  async stopAllOf(dshSessionId: string, reason: string): Promise<string[]> {
    return await stopAllOf(this.reclaim(), dshSessionId, reason)
  }

  /**
   * 回收空闲超时的会话。
   * @param nowMs - 当前时间
   * @returns 被结束的复合键
   */
  async sweepIdle(nowMs: number): Promise<string[]> {
    return await sweepIdle(this.reclaim(), nowMs)
  }

  /**
   * 回收宿主会话已不存在的记录。
   * @returns 被结束的复合键
   */
  async reapOrphaned(): Promise<string[]> {
    return await reapOrphaned(this.reclaim())
  }

  /**
   * 回收模块需要的最小面（sweep.ts 的入口）。
   * @returns 回收面
   */
  reclaim(): ReclaimStore {
    return {
      keys: () => [...this.records.keys()],
      peek: key => this.records.get(key),
      stop: async (key, reason) => await this.stop(key, reason),
      forgetActive: (dshSessionId) => { this.aliases.forget(dshSessionId) },
      ownerAlive: (dshSessionId) => this.options.isOwnerAlive?.(dshSessionId) ?? true,
      idleTimeoutMs: () => this.options.idleTimeoutMs,
    }
  }
  /**
   * 计算 `session start` 的目标浏览器参数。
   * @returns 附加参数（配置指定时带 `--browser`，唯一实例时为空）
   */
  /**
   * 记录一次快照结果（截断后），并刷新页面信息。
   * @param sessionId - DSH 会话 id
   * @param raw - bsk 返回的快照 JSON 字段
   * @returns 规范化后的快照
   */
  recordSnapshot(sessionId: string, raw: { text: string; refCount: number; truncated: boolean }): SnapshotPayload {
    this.update(sessionId, { refsStale: false, pageTitle: extractTitle(raw.text) })
    return projectSnapshot(raw, this.options.snapshotMaxChars)
  }
}
