import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PopoDeliveryService } from '../popo/delivery.js'
import type { WorkorderStore } from '../store/store.js'
import { VivoCollector, type CollectState } from './collector.js'
import { caseKey } from './repository.js'
import { scanOutput } from './sources.js'
import type { VivoCase, VivoCaseView, VivoRun, VivoSummary } from './types.js'

/** vivo 集成配置。 */
export interface VivoConfig {
  projectDir: string
  python: string
  script: string
  defaultTargets: string
}

/** 看板数据。 */
export interface VivoOverview {
  configured: boolean
  projectDir: string
  targets: string[]
  runs: VivoRun[]
  cases: VivoCaseView[]
  summary: VivoSummary
  facets: { games: string[]; positions: string[] }
}

/** 推送消息中最多列出的案例条数。 */
const MAX_NOTIFY_CASES = 15

/** vivo 优秀案例的扫描、入库、对比、采集与推送编排。 */
export class VivoService {
  private readonly collector: VivoCollector

  /**
   * @param store 业务存储
   * @param config 项目目录与采集脚本配置
   * @param delivery POPO 投递服务，缺省时不能推送
   */
  constructor(
    private readonly store: WorkorderStore,
    private readonly config: VivoConfig,
    private readonly delivery?: PopoDeliveryService,
  ) {
    this.collector = new VivoCollector(
      { projectDir: config.projectDir, python: config.python, script: config.script },
      () => { this.sync() },
    )
  }

  /** 输出目录，来自 vivo-data 的 output 约定。 */
  private get outputDir(): string {
    return join(this.config.projectDir, 'output')
  }

  /** 是否已配置且项目目录可用。 */
  configured(): boolean {
    return this.config.projectDir !== '' && existsSync(this.config.projectDir)
  }

  /**
   * 扫描输出目录并把新轮次写入数据库；已有轮次原样刷新。
   * @returns 写入的轮次与案例条数
   */
  sync(): { runs: number; cases: number } {
    if (!this.configured()) return { runs: 0, cases: 0 }
    const scanned = scanOutput(this.outputDir)
    let cases = 0
    for (const { run, cases: items } of scanned) {
      this.store.vivo.saveRun(run, items)
      cases += items.length
    }
    return { runs: scanned.length, cases }
  }

  /**
   * 返回看板数据：轮次、最近一轮的去重案例（含与历史的对比）与汇总。
   * @param filter 可选的游戏与资源位筛选
   */
  overview(filter: { game?: string; position?: string } = {}): VivoOverview {
    const run = this.store.vivo.listRuns(1)[0]
    const all = this.compare(run?.id, filter)
    return {
      configured: this.configured(),
      projectDir: this.config.projectDir,
      targets: this.config.defaultTargets.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean),
      runs: this.store.vivo.listRuns(30),
      cases: all,
      summary: this.store.vivo.summary(),
      facets: this.store.vivo.facets(),
    }
  }

  /**
   * 返回指定轮次的案例并标注与历史的差异。
   * @param runId 轮次；缺省取最新一轮
   * @param filter 可选的游戏与资源位筛选
   */
  compare(runId?: string, filter: { game?: string; position?: string } = {}): VivoCaseView[] {
    const target = runId ?? this.store.vivo.listRuns(1)[0]?.id
    if (!target) return []
    const previous = this.store.vivo.bestCtrBefore(target)
    const cases: VivoCase[] = this.store.vivo.listCases({ runId: target, ...filter })
    return cases.map((item) => {
      const before = previous.get(caseKey(item.game, item.position, item.imageUrl, item.name))
      if (before === undefined) return { ...item, isNew: true }
      return { ...item, previousCtr: before, delta: Math.round((item.ctr - before) * 100) / 100, isNew: false }
    })
  }

  /**
   * 启动一次采集；未配置项目目录时拒绝。
   * @param targets 游戏名；缺省使用配置中的默认目标
   */
  collect(targets?: string[]): { started: boolean; reason?: string; state: CollectState } {
    if (!this.configured()) {
      return { started: false, reason: '未配置 vivo-data 项目目录', state: this.collector.state() }
    }
    const names = targets?.length ? targets : this.config.defaultTargets.split(/[,，\s]+/).filter(Boolean)
    const result = this.collector.start(names)
    return { ...result, state: this.collector.state() }
  }

  /** 返回采集任务状态。 */
  collectState(): CollectState {
    return this.collector.state()
  }

  /** 终止正在运行的采集。 */
  stopCollect(): { stopped: boolean; state: CollectState } {
    return { stopped: this.collector.stop(), state: this.collector.state() }
  }

  /**
   * 把指定轮次的案例推送到 POPO 群机器人。
   * @param runId 轮次；缺省取最新一轮
   * @returns 推送摘要与消息任务标识
   */
  async notify(runId?: string): Promise<{ message: string; taskId?: string }> {
    if (this.delivery === undefined) throw new Error('POPO 投递服务不可用')
    const target = runId ?? this.store.vivo.listRuns(1)[0]?.id
    if (!target) throw new Error('尚无可推送的采集轮次')
    const run = this.store.vivo.listRuns(30).find((item) => item.id === target)
    const cases = this.compare(target)
    if (cases.length === 0) throw new Error('该轮次没有命中的案例')
    const fresh = cases.filter((item) => item.isNew).length
    const lines = [
      `【vivo 优秀案例】${run?.collectedAt ?? target} 采集`,
      `命中 ${cases.length} 条，其中新上榜 ${fresh} 条`,
      ...cases.slice(0, MAX_NOTIFY_CASES).map((item) => {
        const trend = item.isNew ? '新' : item.delta === undefined ? '' : `，较上轮 ${item.delta > 0 ? '+' : ''}${item.delta}%`
        return `· ${item.game}｜${item.position}｜${item.category || item.tab}｜CTR ${item.ctrText}${trend}`
      }),
      ...(cases.length > MAX_NOTIFY_CASES ? [`（其余 ${cases.length - MAX_NOTIFY_CASES} 条见控制面）`] : []),
    ]
    const message = lines.join('\n')
    const result = await this.delivery.deliver({
      key: `vivo-notify-${target}`,
      message,
      sourceType: 'vivo-cases',
      sourceId: target,
      actor: 'admin-ui',
    })
    return { message, taskId: result.taskId }
  }
}
