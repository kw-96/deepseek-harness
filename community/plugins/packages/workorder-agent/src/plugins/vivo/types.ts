/** 一轮 vivo 优秀案例采集。 */
export interface VivoRun {
  id: string
  collectedAt: string
  site: string
  targets: string[]
  status: string
  error?: string
  caseCount: number
  scannedCount: number
  failedCount: number
  outputDir: string
}

/** 单条优秀案例；screenshot 仅保存文件名，读取时按轮次目录拼接。 */
export interface VivoCase {
  runId: string
  seq: number
  game: string
  name: string
  ctr: number
  ctrText: string
  tab: string
  category: string
  position: string
  caseDate: string
  rank: number
  imageUrl: string
  screenshot: string
  collectedAt: string
}

/** 与历史轮次对比后的案例视图。 */
export interface VivoCaseView extends VivoCase {
  /** 同一「游戏 + 资源位 + 素材」在更早轮次中的最高点击率。 */
  previousCtr?: number
  /** 相对上轮的变化值；首轮或新素材为 undefined。 */
  delta?: number
  /** 是否为首次出现（历史无同键记录）。 */
  isNew: boolean
}

/** 看板汇总。 */
export interface VivoSummary {
  runs: number
  cases: number
  averageCtr: number
  latest?: string
}
