import { describe, expect, it } from 'vitest'
import { dateRangeSchema, issueIdSchema, reviewSettingsSchema, sendPreviewSchema } from '../../src/plugins/admin/validation.js'

describe('管理 API 参数校验', () => {
  it('拒绝非法日期、倒序和超长范围', () => {
    expect(dateRangeSchema.safeParse({ startDate: '2026-02-30', endDate: '2026-03-01' }).success).toBe(false)
    expect(dateRangeSchema.safeParse({ startDate: '2026-08-02', endDate: '2026-08-01' }).success).toBe(false)
    expect(dateRangeSchema.safeParse({ startDate: '2026-01-01', endDate: '2026-03-01' }).success).toBe(false)
  })

  it('工单标识只接受正整数', () => {
    expect(issueIdSchema.safeParse('49678').success).toBe(true)
    expect(issueIdSchema.safeParse('0').success).toBe(false)
    expect(issueIdSchema.safeParse('abc').success).toBe(false)
  })

  it('发送只接受预览 ID 和固定确认文本', () => {
    expect(sendPreviewSchema.safeParse({ previewId: crypto.randomUUID(), confirmation: '确认发送正式巡检结果' }).success).toBe(true)
    expect(sendPreviewSchema.safeParse({ startDate: '2026-08-01', confirmation: '确认' }).success).toBe(false)
  })

  it('审核模型服务商与模型 ID 必须同时填写', () => {
    const base = { reviewEnabled: true, reviewProvider: '', reviewModel: '', reviewMaxTokens: 800, reviewKnowledgeBase: '规范', reviewNotificationEnabled: true }
    expect(reviewSettingsSchema.safeParse(base).success).toBe(true)
    expect(reviewSettingsSchema.safeParse({ ...base, reviewProvider: 'provider' }).success).toBe(false)
    expect(reviewSettingsSchema.safeParse({ ...base, reviewProvider: 'provider', reviewModel: 'model' }).success).toBe(true)
  })
})
