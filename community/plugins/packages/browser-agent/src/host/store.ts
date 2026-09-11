/**
 * 会话托管：把每个 DSH 会话映射到一个 bsk 会话，负责懒启动、引用新鲜度、
 * 空闲回收与收尾。插件卸载或 DSH 会话结束时由调用方触发 stop，确保
 * Agent Window 不会被遗留（SKILL.md 的 "No skip stop" 红线由代码保证）。
 */

import type { BskCommandRunner } from './bsk.js'
import { NAVIGATION_TIMEOUT_MS } from './bsk.js'
import { parseBrowsers } from './parse.js'
import type { SnapshotPayload } from './snapshot.js'
import { countRefs, extractTitle, truncateText } from './snapshot.js'

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
  log: (message: string) => void
}

/** 会话托管器。 */
export class BskSessionStore {
  private readonly records = new Map<string, BskSessionRecord>()
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
  async ensure(sessionId: string): Promise<BskSessionRecord> {
    const existing = this.records.get(sessionId)
    if (existing !== undefined) return existing
    await this.runner.ensureDaemon()
    const outcome = await this.runner.run(['session', 'start', '--json', ...await this.browserArgs()], {
      timeoutMs: NAVIGATION_TIMEOUT_MS,
    })
    const bskSessionId = String(outcome.json?.['session_id'] ?? '')
    if (bskSessionId === '') throw new Error('bsk 未返回会话 id（session start 输出异常）')
    const record: BskSessionRecord = {
      bskSessionId,
      windowId: outcome.json?.['agent_window_id'] !== undefined ? String(outcome.json['agent_window_id']) : null,
      startedAtMs: Date.now(),
      lastActionAtMs: Date.now(),
      currentUrl: null,
      pageTitle: null,
      refsStale: true,
      tabCount: 1,
      lastScreenshotPath: null,
      lastError: null,
    }
    this.records.set(sessionId, record)
    this.options.log(`browser-agent: 已为会话 ${sessionId} 启动 bsk 会话 ${bskSessionId}`)
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
    return [...this.records.values()].map(record => record.bskSessionId)
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

  /**
   * 结束全部本插件启动的会话（插件卸载时的兜底）。
   * @param reason - 触发原因
   */
  async stopAll(reason: string): Promise<void> {
    const ids = [...this.records.keys()]
    await Promise.all(ids.map(async (id) => await this.stop(id, reason)))
  }

  /**
   * 回收空闲超时的会话。
   * @param nowMs - 当前时间
   * @returns 被结束的 DSH 会话 id
   */
  async sweepIdle(nowMs: number): Promise<string[]> {
    const expired = [...this.records.entries()]
      .filter(([, record]) => nowMs - record.lastActionAtMs > this.options.idleTimeoutMs)
      .map(([sessionId]) => sessionId)
    for (const sessionId of expired) await this.stop(sessionId, '空闲超时自动回收')
    return expired
  }

  /**
   * 计算 `session start` 的目标浏览器参数。
   * @returns 附加参数（配置指定时带 `--browser`，唯一实例时为空）
   */
  private async browserArgs(): Promise<string[]> {
    if (this.browserInstance !== '') return ['--browser', this.browserInstance]
    const listed = await this.runner.run(['browsers', '--json'], { timeoutMs: NAVIGATION_TIMEOUT_MS })
    const browsers = parseBrowsers(listed.json, listed.rows)
    if (browsers.length === 0) {
      throw new Error('未检测到已连接的浏览器：请确认 browser-skill 扩展已加载并连接（可执行 bsk doctor 检查）')
    }
    if (browsers.length > 1) {
      const candidates = browsers
        .map(browser => `${browser.instanceId}（${browser.browserName}${browser.label === '' ? '' : ` / ${browser.label}`}）`)
        .join('、')
      throw new Error(`检测到 ${String(browsers.length)} 个浏览器实例，请在插件配置 browserInstance 中指定其一：${candidates}`)
    }
    return []
  }

  /**
   * 记录一次快照结果（截断后），并刷新页面信息。
   * @param sessionId - DSH 会话 id
   * @param raw - bsk 返回的快照 JSON 字段
   * @returns 规范化后的快照
   */
  recordSnapshot(sessionId: string, raw: { text: string; refCount: number; truncated: boolean }): SnapshotPayload {
    const cut = truncateText(raw.text, this.options.snapshotMaxChars)
    const refCount = raw.refCount > 0 ? raw.refCount : countRefs(raw.text)
    this.update(sessionId, {
      refsStale: false,
      pageTitle: extractTitle(raw.text),
    })
    return { text: cut.text, refCount, truncated: raw.truncated || cut.truncated }
  }
}
