/** 单项设计数量统计：合计、AI 管线数量及两侧占比（百分比数值，保留两位小数）。 */
export interface QuantityStat {
  quantity: number
  aiQuantity: number
  aiRatio: number
  manualRatio: number
}

/** 美术需求分类维度的统计行。 */
export interface CategoryStat extends QuantityStat {
  category: string
}

/** 项目维度的统计块：项目总计与分类明细。 */
export interface ProjectStat {
  name: string
  stat: QuantityStat
  categories: CategoryStat[]
}

/** 游戏产品维度的统计行。 */
export interface GameStat {
  name: string
  quantity: number
}

/** 指派给维度的统计行：合计、AI 占比与各分类数量。 */
export interface AssigneeStat {
  name: string
  stat: QuantityStat
  categories: CategoryStat[]
}

/** 工单数据统计报告，口径与会话中周期统计一致。 */
export interface StatsReport {
  startDate?: string
  endDate?: string
  issueCount: number
  total: QuantityStat
  categories: CategoryStat[]
  projects: ProjectStat[]
  games: GameStat[]
  assignees: AssigneeStat[]
}
