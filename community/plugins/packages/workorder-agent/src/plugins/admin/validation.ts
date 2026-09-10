import { z } from 'zod'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function validDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0))
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 0) - 1 && date.getUTCDate() === day
}

export const dateRangeSchema = z.object({
  startDate: z.string().regex(DATE_PATTERN).refine(validDate, '开始日期无效'),
  endDate: z.string().regex(DATE_PATTERN).refine(validDate, '结束日期无效'),
}).superRefine((value, context) => {
  if (value.startDate > value.endDate) {
    context.addIssue({ code: 'custom', message: '开始日期不能晚于结束日期' })
    return
  }
  const days = (Date.parse(`${value.endDate}T00:00:00Z`) - Date.parse(`${value.startDate}T00:00:00Z`)) / 86_400_000
  if (days > 31) context.addIssue({ code: 'custom', message: '日期范围不能超过 31 天' })
})

export const previewIdSchema = z.string().uuid()
export const messageIdSchema = z.string().uuid()
export const issueIdSchema = z.coerce.number().int().positive()

export const resumeMessageSchema = z.object({
  confirmation: z.literal('确认从失败分段继续发送'),
})

export const sendPreviewSchema = z.object({
  previewId: previewIdSchema,
  confirmation: z.literal('确认发送正式巡检结果'),
})

export const resendPreviewSchema = z.object({
  confirmation: z.literal('确认再次发送复核结果'),
})

/** 控制面允许在线修改的非敏感运行设置。 */
export const runtimeSettingsSchema = z.object({
  scheduleEnabled: z.boolean().optional(),
  automaticSendEnabled: z.boolean().optional(),
  webhookProcessingEnabled: z.boolean().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), '至少提供一项设置')

/** 模型审核与提单规范配置，服务商和模型 ID 必须成对提供。 */
export const reviewSettingsSchema = z.object({
  reviewEnabled: z.boolean(),
  reviewProvider: z.string().max(120),
  reviewModel: z.string().max(240),
  reviewMaxTokens: z.number().int().min(64).max(8_192),
  reviewKnowledgeBase: z.string().trim().min(1).max(20_000),
  reviewNotificationEnabled: z.boolean(),
}).superRefine((value, context) => {
  if (Boolean(value.reviewProvider.trim()) !== Boolean(value.reviewModel.trim())) {
    context.addIssue({ code: 'custom', message: '审核模型服务商与模型 ID 必须同时填写' })
  }
})

const DATE_QUERY = z.string().regex(DATE_PATTERN).refine(validDate, '日期无效').optional()

/** 数据统计查询参数：日期可缺省，同时提供时校验先后顺序。 */
export const statsQuerySchema = z.object({
  startDate: DATE_QUERY,
  endDate: DATE_QUERY,
}).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, '开始日期不能晚于结束日期')
