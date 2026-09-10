import type { StatsRow } from '../store/issues/repository.js'
import type { WorkorderStore } from '../store/store.js'
import type { AssigneeStat, CategoryStat, GameStat, ProjectStat, QuantityStat, StatsReport } from './types.js'

/** 固定顺序的美术需求分类；其余分类按数量降序排在资源位之后。 */
const CATEGORY_ORDER = ['KV', '动画设计', 'H5页面', '资源位']

/** 不纳入统计口径的分类：总单属于巡检修正项，需负责人更正易协作。 */
const EXCLUDED_CATEGORIES = ['总单']

/** 固定顺序的项目；其余项目按数量降序排在最后。 */
const PROJECT_ORDER = ['渠道美术', '回流业务', 'CPS业务', 'AI运营活动']

const EMPTY_NAME = '（空/未填）'

/**
 * 解析设计数量为数值；非法或缺失值按 0 计。
 * @param value 原始字段值
 * @returns 非负数值
 */
function parseQuantity(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }
  return 0
}

/**
 * 判定工单是否走 AI 管线：仅「是」计入 AI，空或其余值按人工计。
 * @param value 原始字段值
 * @returns 是否计入 AI 管线
 */
function isAiPipeline(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === '是'
}

/**
 * 计算占比统计：占比保留两位小数，总量为 0 时两侧均为 0。
 * @param aiQuantity AI 管线设计数量
 * @param quantity 设计数量总计
 * @returns 数量与占比统计
 */
export function toQuantityStat(aiQuantity: number, quantity: number): QuantityStat {
  const aiRatio = quantity > 0 ? Math.round((aiQuantity / quantity) * 10_000) / 100 : 0
  return { quantity, aiQuantity, aiRatio, manualRatio: quantity > 0 ? Math.round((100 - aiRatio) * 100) / 100 : 0 }
}

interface CategoryAccumulator {
  quantity: number
  aiQuantity: number
}

interface Bucket {
  name: string
  quantity: number
  aiQuantity: number
  categories: Map<string, CategoryAccumulator>
}

/** 将分类累加器映射转为固定顺序在前的统计行，其余分类按数量降序。 */
function orderCategories(map: Map<string, CategoryAccumulator>): CategoryStat[] {
  const result: CategoryStat[] = []
  const append = (name: string): void => {
    const stat = map.get(name)
    if (!stat) return
    result.push({ category: name, ...toQuantityStat(stat.aiQuantity, stat.quantity) })
    map.delete(name)
  }
  CATEGORY_ORDER.forEach(append)
  for (const [name, stat] of [...map.entries()].sort((left, right) => right[1].quantity - left[1].quantity)) {
    result.push({ category: name, ...toQuantityStat(stat.aiQuantity, stat.quantity) })
  }
  return result
}

/** 汇总一组行的分类统计。 */
function summarizeCategories(rows: StatsRow[]): CategoryStat[] {
  const map = new Map<string, CategoryAccumulator>()
  for (const row of rows) {
    const category = row.artCategory.trim() || EMPTY_NAME
    const quantity = parseQuantity(row.designQuantity)
    const aiQuantity = isAiPipeline(row.aiPipelineTime) ? quantity : 0
    const stat = map.get(category)
    if (stat) {
      stat.quantity += quantity
      stat.aiQuantity += aiQuantity
    } else {
      map.set(category, { quantity, aiQuantity })
    }
  }
  return orderCategories(map)
}

/**
 * 对一组行按名称分组求和，分类空值统一显示占位名称。
 * @param rows 统计行
 * @param keyOf 分组键提取函数
 * @returns 按数量降序的分组桶
 */
function bucketBy(rows: StatsRow[], keyOf: (row: StatsRow) => string): Bucket[] {
  const buckets = new Map<string, Bucket>()
  for (const row of rows) {
    const rawName = keyOf(row).trim()
    const name = rawName === '' ? EMPTY_NAME : rawName
    const quantity = parseQuantity(row.designQuantity)
    const aiQuantity = isAiPipeline(row.aiPipelineTime) ? quantity : 0
    let bucket = buckets.get(name)
    if (!bucket) {
      bucket = { name, quantity: 0, aiQuantity: 0, categories: new Map() }
      buckets.set(name, bucket)
    }
    bucket.quantity += quantity
    bucket.aiQuantity += aiQuantity
    const category = row.artCategory.trim() || EMPTY_NAME
    const stat = bucket.categories.get(category)
    if (stat) {
      stat.quantity += quantity
      stat.aiQuantity += aiQuantity
    } else {
      bucket.categories.set(category, { quantity, aiQuantity })
    }
  }
  return [...buckets.values()].sort((left, right) => right.quantity - left.quantity)
}

/**
 * 聚合统计报告纯函数，便于单元测试与复用。
 * 总单分类的行不纳入任何统计维度。
 */
export function aggregateStats(rows: StatsRow[], startDate?: string, endDate?: string): StatsReport {
  const included = rows.filter((row) => !EXCLUDED_CATEGORIES.includes(row.artCategory.trim()))
  const total = toQuantityStat(
    included.reduce((sum, row) => sum + (isAiPipeline(row.aiPipelineTime) ? parseQuantity(row.designQuantity) : 0), 0),
    included.reduce((sum, row) => sum + parseQuantity(row.designQuantity), 0),
  )
  const projects: ProjectStat[] = bucketBy(included, (row) => row.projectName).map((bucket) => ({
    name: bucket.name,
    stat: toQuantityStat(bucket.aiQuantity, bucket.quantity),
    categories: orderCategories(bucket.categories),
  }))
  projects.sort((left, right) => {
    const leftIndex = PROJECT_ORDER.indexOf(left.name)
    const rightIndex = PROJECT_ORDER.indexOf(right.name)
    if (leftIndex >= 0 || rightIndex >= 0) {
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
    }
    return right.stat.quantity - left.stat.quantity
  })
  const games: GameStat[] = bucketBy(included, (row) => row.gameProduct)
    .map((bucket) => ({ name: bucket.name, quantity: bucket.quantity }))
  const assignees: AssigneeStat[] = bucketBy(included, (row) => row.assigneeName).map((bucket) => ({
    name: bucket.name,
    stat: toQuantityStat(bucket.aiQuantity, bucket.quantity),
    categories: orderCategories(bucket.categories),
  }))
  return {
    startDate, endDate, issueCount: included.length, total,
    categories: summarizeCategories(included), projects, games, assignees,
  }
}

/** 工单数据统计服务：读取本地快照并按会话口径聚合。 */
export class WorkorderStatsService {
  constructor(private readonly store: WorkorderStore) {}

  /**
   * 计算指定周期（按期望交付时间）的工单数据统计。
   * @param startDate 起始日期，缺省不限制
   * @param endDate 结束日期，缺省不限制
   * @returns 统计报告
   */
  compute(startDate?: string, endDate?: string): StatsReport {
    const rows = this.store.issues.listStatsRows(startDate, endDate)
    return aggregateStats(rows, startDate, endDate)
  }
}
