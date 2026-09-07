import { join } from 'node:path'
import type { ProjectMap } from './plugins/gcp/service.js'

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
  adminToken: string
  webhookToken: string
  gcpUserKey: string
  gcpUrl?: string
  gcpHost?: string
  popoWebhookUrl: string
  popoWebhookSecret?: string
  completedStatusId?: number
  projectIdChannelArt?: number
  projectIdReturnBusiness?: number
  projectIdAiOperations?: number
}

export interface AppConfig {
  port: number
  dataDir: string
  adminToken: string
  webhookToken: string
  projects: ProjectMap
  completedStatusId: number
  gcp: { url: string; host: string; userKey: string }
  popo: { url: string; secret?: string }
}

/**
 * 将已解析字段组装为运行配置。
 * @param input 令牌、项目与连接参数
 * @returns 校验后的应用配置
 */
export function buildAppConfig(input: AppConfigInput): AppConfig {
  const adminToken = input.adminToken.trim()
  const webhookToken = input.webhookToken.trim()
  const gcpUserKey = input.gcpUserKey.trim()
  const popoWebhookUrl = input.popoWebhookUrl.trim()
  if (!adminToken) throw new Error('缺少配置：ADMIN_TOKEN')
  if (!webhookToken) throw new Error('缺少配置：WEBHOOK_TOKEN')
  if (!gcpUserKey) throw new Error('缺少配置：GCP_USER_KEY')
  if (!popoWebhookUrl) throw new Error('缺少配置：POPO_WEBHOOK_URL')
  return {
    port: input.port ?? 3081,
    dataDir: input.dataDir?.trim() || join(process.cwd(), '.data'),
    adminToken,
    webhookToken,
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
  }
}

/** 从进程环境变量读取并校验运行配置。 */
export function loadConfig(): AppConfig {
  return buildAppConfig({
    port: Number(process.env.PORT || 3081),
    dataDir: process.env.DATA_DIR?.trim(),
    adminToken: required('ADMIN_TOKEN'),
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
  })
}
