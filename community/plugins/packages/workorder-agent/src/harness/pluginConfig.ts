import z from '@deepseek-ai/schemastery'
import { buildAppConfig, type AppConfig } from '../config.js'

/** 工单 Host 插件的可热更新配置。 */
export interface PluginConfig {
  enabled: boolean
  dataDir: string
  adminToken: string
  webhookToken: string
  gcpUserKey: string
  gcpUrl: string
  gcpHost: string
  popoWebhookUrl: string
  popoWebhookSecret: string
  completedStatusId: number
  projectIdChannelArt: number
  projectIdReturnBusiness: number
  projectIdAiOperations: number
}

/** Cordis / 设置卡片使用的工单插件配置模式。 */
export const Config = z.object({
  enabled: z.boolean().default(true).description('启用工单巡检运行时'),
  dataDir: z.string().default('').description('数据目录，空则使用工作目录下 .data'),
  adminToken: z.string().role('secret').default('').description('管理接口鉴权令牌'),
  webhookToken: z.string().role('secret').default('').description('Webhook 入口令牌'),
  gcpUserKey: z.string().role('secret').default('').description('易协作 GCP 用户 Key'),
  gcpUrl: z.string().default('https://mcp.netease.com/servers/gcp/mcp').description('GCP MCP 地址'),
  gcpHost: z.string().default('promoteart.pm.netease.com').description('易协作 Host'),
  popoWebhookUrl: z.string().default('').description('POPO 群机器人地址'),
  popoWebhookSecret: z.string().role('secret').default('').description('POPO 群机器人签名'),
  completedStatusId: z.number().default(6).description('美术完成状态 ID'),
  projectIdChannelArt: z.number().default(7).description('渠道美术项目 ID'),
  projectIdReturnBusiness: z.number().default(2001).description('回流业务项目 ID'),
  projectIdAiOperations: z.number().default(2004).description('AI 运营活动项目 ID'),
}) as unknown as z<PluginConfig>

/**
 * 将插件配置映射为业务运行配置。
 * @param plugin 已按 schema 解析的插件配置
 * @returns 业务运行时配置
 */
export function toAppConfig(plugin: PluginConfig): AppConfig {
  return buildAppConfig({
    dataDir: plugin.dataDir,
    adminToken: plugin.adminToken,
    webhookToken: plugin.webhookToken,
    gcpUserKey: plugin.gcpUserKey,
    gcpUrl: plugin.gcpUrl,
    gcpHost: plugin.gcpHost,
    popoWebhookUrl: plugin.popoWebhookUrl,
    popoWebhookSecret: plugin.popoWebhookSecret,
    completedStatusId: plugin.completedStatusId,
    projectIdChannelArt: plugin.projectIdChannelArt,
    projectIdReturnBusiness: plugin.projectIdReturnBusiness,
    projectIdAiOperations: plugin.projectIdAiOperations,
  })
}
