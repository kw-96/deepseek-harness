import { join } from 'node:path'
import type { ProjectMap } from './plugins/gcp/service.js'

/** 默认提单规范，作为模型审核的可编辑知识库初始内容。 */
export const DEFAULT_REVIEW_KNOWLEDGE_BASE = [
  '仅核验状态为“美术完成”且期望交付时间不早于 2026-07-26 的设计工单。',
  '子单必须填写所属项目对应的投放渠道、AI管线耗时、总工时和设计数量。',
  'AI管线耗时只能填写“是”或“否”，总工时和设计数量必须是大于 0 的数值。',
  '总单不填写设计数量；已填写时仅提示提单人确认工单类型。',
  '审核结论必须基于工单快照和本知识库，不得猜测、修改工单或编造字段。',
].join('\n')

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`缺少环境变量：${name}`)
  return value
}

function positiveInt(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} 必须为正整数`)
  return value
}

export interface AppConfigInput {
  port?: number
  dataDir?: string
  webhookToken: string
  webhookIngressEnabled?: boolean
  webhookIngressHost?: string
  webhookIngressPort?: number
  gcpUserKey: string
  gcpUrl?: string
  gcpHost?: string
  popoWebhookUrl: string
  popoWebhookSecret?: string
  completedStatusId?: number
  projectIdChannelArt?: number
  projectIdReturnBusiness?: number
  projectIdAiOperations?: number
  reviewEnabled?: boolean
  reviewProvider?: string
  reviewModel?: string
  reviewMaxTokens?: number
  reviewKnowledgeBase?: string
  reviewNotificationEnabled?: boolean
  vivoProjectDir?: string
  vivoPython?: string
  vivoScript?: string
  vivoTargets?: string
}

export interface AppConfig {
  port: number
  dataDir: string
  webhookToken: string
  /** 独立事件入口：供内网中的易协作网关回调，关闭时只保留宿主前缀内的入口。 */
  webhookIngress: { enabled: boolean; host: string; port: number }
  projects: ProjectMap
  completedStatusId: number
  gcp: { url: string; host: string; userKey: string }
  popo: { url: string; secret?: string }
  review: {
    enabled: boolean
    provider?: string
    model?: string
    maxTokens: number
    knowledgeBase: string
    notificationEnabled: boolean
  }
  /** vivo 优秀案例集成：项目目录、采集解释器与默认采集目标。 */
  vivo: { projectDir: string; python: string; script: string; defaultTargets: string }
}

/**
 * 将已解析字段组装为运行配置。
 * @param input 令牌、项目与连接参数
 * @returns 校验后的应用配置
 */
export function buildAppConfig(input: AppConfigInput): AppConfig {
  const webhookToken = input.webhookToken.trim()
  const gcpUserKey = input.gcpUserKey.trim()
  const popoWebhookUrl = input.popoWebhookUrl.trim()
  if (!webhookToken) throw new Error('缺少配置：WEBHOOK_TOKEN')
  if (!gcpUserKey) throw new Error('缺少配置：GCP_USER_KEY')
  if (!popoWebhookUrl) throw new Error('缺少配置：POPO_WEBHOOK_URL')
  const provider = input.reviewProvider?.trim() || undefined
  const model = input.reviewModel?.trim() || undefined
  if (Boolean(provider) !== Boolean(model)) throw new Error('审核模型服务商与模型 ID 必须同时填写')
  const knowledgeBase = input.reviewKnowledgeBase?.trim() || DEFAULT_REVIEW_KNOWLEDGE_BASE
  return {
    port: input.port ?? 3081,
    dataDir: input.dataDir?.trim() || join(process.cwd(), '.data'),
    webhookToken,
    webhookIngress: {
      enabled: input.webhookIngressEnabled ?? false,
      host: input.webhookIngressHost?.trim() || '127.0.0.1',
      port: positiveInt('WEBHOOK_INGRESS_PORT', input.webhookIngressPort ?? 3091),
    },
    projects: {
      渠道美术: positiveInt('PROJECT_ID_CHANNEL_ART', input.projectIdChannelArt ?? 7),
      回流业务: positiveInt('PROJECT_ID_RETURN_BUSINESS', input.projectIdReturnBusiness ?? 2001),
      AI运营活动: positiveInt('PROJECT_ID_AI_OPERATIONS', input.projectIdAiOperations ?? 2004),
    },
    completedStatusId: positiveInt('GCP_COMPLETED_STATUS_ID', input.completedStatusId ?? 6),
    gcp: {
      url: input.gcpUrl?.trim() || 'https://mcp.netease.com/servers/gcp/mcp',
      host: input.gcpHost?.trim() || 'promoteart.pm.netease.com',
      userKey: gcpUserKey,
    },
    popo: { url: popoWebhookUrl, secret: input.popoWebhookSecret?.trim() || undefined },
    review: {
      enabled: input.reviewEnabled ?? true,
      ...provider && model ? { provider, model } : {},
      maxTokens: positiveInt('REVIEW_MAX_TOKENS', input.reviewMaxTokens ?? 800),
      knowledgeBase,
      notificationEnabled: input.reviewNotificationEnabled ?? true,
    },
    vivo: {
      projectDir: input.vivoProjectDir?.trim() || '',
      python: input.vivoPython?.trim() || 'python',
      script: input.vivoScript?.trim() || 'save_egg_party.py',
      defaultTargets: input.vivoTargets?.trim() || '蛋仔派对',
    },
  }
}

/** 从进程环境变量读取并校验运行配置。 */
export function loadConfig(): AppConfig {
  return buildAppConfig({
    port: Number(process.env.PORT || 3081),
    dataDir: process.env.DATA_DIR?.trim(),
    webhookToken: required('WEBHOOK_TOKEN'),
    gcpUserKey: required('GCP_USER_KEY'),
    gcpUrl: process.env.GCP_MCP_URL?.trim(),
    gcpHost: process.env.GCP_HOST?.trim(),
    popoWebhookUrl: required('POPO_WEBHOOK_URL'),
    popoWebhookSecret: process.env.POPO_WEBHOOK_SECRET?.trim(),
    completedStatusId: process.env.GCP_COMPLETED_STATUS_ID
      ? Number(process.env.GCP_COMPLETED_STATUS_ID)
      : 6,
    projectIdChannelArt: process.env.PROJECT_ID_CHANNEL_ART
      ? Number(process.env.PROJECT_ID_CHANNEL_ART)
      : 7,
    projectIdReturnBusiness: process.env.PROJECT_ID_RETURN_BUSINESS
      ? Number(process.env.PROJECT_ID_RETURN_BUSINESS)
      : 2001,
    projectIdAiOperations: process.env.PROJECT_ID_AI_OPERATIONS
      ? Number(process.env.PROJECT_ID_AI_OPERATIONS)
      : 2004,
    reviewEnabled: process.env.REVIEW_ENABLED !== 'false',
    reviewProvider: process.env.REVIEW_MODEL_PROVIDER?.trim(),
    reviewModel: process.env.REVIEW_MODEL?.trim(),
    reviewMaxTokens: process.env.REVIEW_MAX_TOKENS ? Number(process.env.REVIEW_MAX_TOKENS) : 800,
    reviewKnowledgeBase: process.env.REVIEW_KNOWLEDGE_BASE?.trim(),
    reviewNotificationEnabled: process.env.REVIEW_NOTIFICATION_ENABLED !== 'false',
    vivoProjectDir: process.env.VIVO_DATA_DIR?.trim(),
    vivoPython: process.env.VIVO_PYTHON?.trim(),
    vivoScript: process.env.VIVO_SCRIPT?.trim(),
    vivoTargets: process.env.VIVO_TARGETS?.trim(),
  })
}
