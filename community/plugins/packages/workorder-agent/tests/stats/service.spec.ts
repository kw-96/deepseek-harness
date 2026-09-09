import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkorderStatsService, aggregateStats, toQuantityStat } from '../../src/plugins/stats/service.js'
import type { StatsRow } from '../../src/plugins/store/issues/repository.js'
import { WorkorderStore } from '../../src/plugins/store/store.js'
import type { IssueSnapshot } from '../../src/domain/types.js'

const directories: string[] = []

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'workorder-stats-'))
  directories.push(directory)
  return join(directory, 'stats.sqlite')
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function row(partial: Partial<StatsRow>): StatsRow {
  return {
    expectedDeliveryDate: '2026-08-27', projectName: '渠道美术', artCategory: '资源位',
    aiPipelineTime: '是', designQuantity: 10, gameProduct: '蛋仔派对', assigneeName: '邵灵玉',
    ...partial,
  }
}

describe('工单数据统计口径', () => {
  it('占比保留两位小数，总量为 0 时两侧均为 0', () => {
    expect(toQuantityStat(2, 3)).toEqual({ quantity: 3, aiQuantity: 2, aiRatio: 66.67, manualRatio: 33.33 })
    expect(toQuantityStat(0, 0)).toEqual({ quantity: 0, aiQuantity: 0, aiRatio: 0, manualRatio: 0 })
    expect(toQuantityStat(53, 78)).toEqual({ quantity: 78, aiQuantity: 53, aiRatio: 67.95, manualRatio: 32.05 })
  })

  it('AI 仅计「是」，空值按人工；设计数量非法按 0', () => {
    const report = aggregateStats([
      row({ designQuantity: 10, aiPipelineTime: '是' }),
      row({ designQuantity: 5, aiPipelineTime: '' }),
      row({ designQuantity: 3, aiPipelineTime: '否' }),
      row({ designQuantity: 'abc', aiPipelineTime: '是' }),
      row({ designQuantity: {}, aiPipelineTime: '是' }),
    ])
    expect(report.total).toMatchObject({ quantity: 18, aiQuantity: 10 })
  })

  it('分类固定顺序在前，其余分类按数量降序，总计为各行之和', () => {
    const report = aggregateStats([
      row({ artCategory: '资源位', designQuantity: 30, aiPipelineTime: '是' }),
      row({ artCategory: '动画设计', designQuantity: 20, aiPipelineTime: '' }),
      row({ artCategory: 'KV', designQuantity: 10, aiPipelineTime: '是' }),
      row({ artCategory: 'H5页面', designQuantity: 0, aiPipelineTime: '否' }),
      row({ artCategory: '其他美术', designQuantity: 8, aiPipelineTime: '是' }),
      row({ artCategory: '三渲二', designQuantity: 5, aiPipelineTime: '否' }),
    ])
    expect(report.total.quantity).toBe(73)
    expect(report.categories.map((item) => item.category)).toEqual(['KV', '动画设计', 'H5页面', '资源位', '其他美术', '三渲二'])
    expect(report.categories.reduce((sum, item) => sum + item.quantity, 0)).toBe(73)
  })

  it('总单分类不纳入任何统计维度，其余分类正常纳入', () => {
    const report = aggregateStats([
      row({ artCategory: '资源位', designQuantity: 30, aiPipelineTime: '是' }),
      row({ artCategory: '总单', designQuantity: 100, aiPipelineTime: '是', gameProduct: '排除游戏', assigneeName: '排除人' }),
      row({ artCategory: 'AI应用平台', designQuantity: 50, aiPipelineTime: '是', gameProduct: '排除游戏', assigneeName: '排除人' }),
    ])
    expect(report.issueCount).toBe(2)
    expect(report.total).toMatchObject({ quantity: 80, aiQuantity: 80 })
    expect(report.categories.map((item) => item.category)).toEqual(['资源位', 'AI应用平台'])
    expect(report.games).toEqual([{ name: '排除游戏', quantity: 50 }, { name: '蛋仔派对', quantity: 30 }])
    expect(report.assignees[0]).toMatchObject({ name: '排除人', stat: { quantity: 50, aiQuantity: 50 } })
    expect(report.assignees[1]).toMatchObject({ name: '邵灵玉', stat: { quantity: 30, aiQuantity: 30 } })
  })

  it('项目固定顺序在前，游戏与指派给按数量降序，空值显示占位名称', () => {
    const report = aggregateStats([
      row({ projectName: '回流业务', gameProduct: '光遇', assigneeName: '劳庆文', designQuantity: 20 }),
      row({ projectName: '渠道美术', gameProduct: '', assigneeName: '', designQuantity: 30 }),
      row({ projectName: '其他项目', gameProduct: '蛋仔派对', assigneeName: '邵灵玉', designQuantity: 10 }),
    ])
    expect(report.projects.map((item) => item.name)).toEqual(['渠道美术', '回流业务', '其他项目'])
    expect(report.games.map((item) => item.name)).toEqual(['（空/未填）', '光遇', '蛋仔派对'])
    expect(report.assignees[0]).toMatchObject({ name: '（空/未填）', stat: { quantity: 30 } })
  })

  it('服务按期望交付时间（含端点）筛选并返回工单条数', () => {
    const store = new WorkorderStore(databasePath())
    const snapshot: IssueSnapshot = {
      id: 1, projectName: '渠道美术', subject: '主题', submitterName: '提单人', assigneeName: '邵灵玉', statusName: '美术完成',
      gameProduct: '蛋仔派对', expectedDeliveryDate: '2026-08-27', artCategory: '资源位',
      deliveryChannel: 'VIVO', returnDeliveryChannel: '', aiDeliveryChannel: '', aiPipelineTime: '是',
      totalHours: 2, designQuantity: 12, startDate: '2026-08-26', dueDate: '2026-08-28',
      createdOn: '2026-08-26', updatedOn: '2026-08-27 10:00:00', closedOn: '',
    }
    store.issues.upsert(snapshot)
    store.issues.upsert({ ...snapshot, id: 2, designQuantity: 8, aiPipelineTime: '', expectedDeliveryDate: '2026-09-01' })
    store.issues.upsert({ ...snapshot, id: 3, designQuantity: 9, aiPipelineTime: '是', expectedDeliveryDate: '2026-09-08' })
    store.issues.upsert({ ...snapshot, id: 4, designQuantity: 7, aiPipelineTime: '是', expectedDeliveryDate: '2026-09-09' })
    store.issues.upsert({ ...snapshot, id: 5, designQuantity: 6, aiPipelineTime: '是', expectedDeliveryDate: '' })
    const service = new WorkorderStatsService(store)
    const report = service.compute('2026-08-26', '2026-09-08')
    expect(report.issueCount).toBe(3)
    expect(report.total).toMatchObject({ quantity: 29, aiQuantity: 21 })
    expect(service.compute()).toMatchObject({ issueCount: 5, total: { quantity: 42, aiQuantity: 34 } })
    store.close()
  })
})
