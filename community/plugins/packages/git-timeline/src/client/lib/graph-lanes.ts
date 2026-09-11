/** 泳道图：由提交的父指针推导每行的泳道与贯穿列。 */

import type { GitCommit } from '../../types.js'

/** 图上最多绘制的泳道数，超出后归到最后一条。 */
export const MAX_LANES = 5

/** 泳道配色（VSCode 风格的五色循环）。 */
export const LANE_COLORS: readonly string[] = ['#4d90fe', '#22c55e', '#f59e0b', '#a855f7', '#ec4899']

/** 一行图：提交、它所在的泳道、该行需要绘制的泳道列。 */
export interface GraphRow {
  commit: GitCommit
  /** 提交节点所在的泳道（已按 MAX_LANES 收敛）。 */
  lane: number
  /** 本行纵向贯穿的泳道列（含提交所在的泳道）。 */
  columns: readonly number[]
  /** 合并提交（父提交多于一个）。 */
  merge: boolean
}

/** 泳道配色索引。 */
export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? LANE_COLORS[0] ?? '#4d90fe'
}

/**
 * 计算提交历史的泳道。
 *
 * 规则沿用常见 Git 图算法：先看哪条泳道正等待该提交（多条则折叠为合并），
 * 否则新开一条；随后首父留在当前泳道，其余父各占一条空闲泳道。
 * @param commits 按时间倒序的提交（`git log` 的顺序）
 * @param maxLanes 绘制上限
 * @returns 每行的泳道信息
 */
export function computeGraph(commits: readonly GitCommit[], maxLanes = MAX_LANES): GraphRow[] {
  const flow: (string | null)[] = []
  const rows: GraphRow[] = []
  const clamp = (lane: number): number => Math.min(lane, maxLanes - 1)

  for (const commit of commits) {
    const waiting = flow.reduce<number[]>((lanes, hash, index) => {
      if (hash === commit.hash) lanes.push(index)
      return lanes
    }, [])
    let lane = waiting[0] ?? -1
    if (lane < 0) {
      const free = flow.indexOf(null)
      if (free < 0) { flow.push(commit.hash); lane = flow.length - 1 } else { flow[free] = commit.hash; lane = free }
    } else {
      for (const duplicate of waiting.slice(1)) flow[duplicate] = null
    }

    const [first, ...rest] = commit.parents
    flow[lane] = first ?? null
    for (const parent of rest) {
      if (flow.includes(parent)) continue
      const free = flow.indexOf(null)
      if (free < 0) flow.push(parent)
      else flow[free] = parent
    }

    const columns = flow
      .map((hash, index) => (hash === null && index !== lane ? -1 : index))
      .filter(index => index >= 0)
    if (!columns.includes(lane)) columns.push(lane)
    rows.push({ commit, lane: clamp(lane), columns: [...new Set(columns.map(clamp))].sort((a, b) => a - b), merge: commit.parents.length > 1 })
  }
  return rows
}

/** 泳道列的最大宽度（像素/列）。 */
export const LANE_WIDTH = 12
