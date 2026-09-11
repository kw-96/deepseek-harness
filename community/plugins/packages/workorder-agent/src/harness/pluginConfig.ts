import z from '@deepseek-ai/schemastery'
import { buildAppConfig, DEFAULT_REVIEW_KNOWLEDGE_BASE, type AppConfig } from '../config.js'

/** 工单 Host 插件的可热更新配置。 */
export interface PluginConfig {
  enabled: boolean
  dataDir: string
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
  reviewEnabled: boolean
  reviewProvider: string
  reviewModel: string
  reviewMaxTokens: number
  reviewKnowledgeBase: string
  reviewNotificationEnabled: boolean
}

/** Cordis / 设置卡片使用的工单插件配置模式。 */
export const Config = z.object({
  enabled: z.boolean().default(true).description('启用工单巡检运行时'),
  dataDir: z.string().default('').description('数据目录，空则使用工作目录下 .data'),
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
  reviewEnabled: z.boolean().default(true).description('启用模型提单审核'),
  reviewProvider: z.string().default('').description('审核模型服务商，留空继承 Harness 默认模型'),
  reviewModel: z.string().default('').description('审核模型 ID，留空继承 Harness 默认模型'),
  reviewMaxTokens: z.number().default(800).description('审核模型最大输出 token 数'),
  reviewKnowledgeBase: z.string().default(DEFAULT_REVIEW_KNOWLEDGE_BASE).description('提单规范知识库'),
  reviewNotificationEnabled: z.boolean().default(true).description('审核发现缺项时发送 POPO 提醒'),
}) as unknown as z<PluginConfig>

/**
 * 将插件配置映射为业务运行配置。
 * @param plugin 已按 schema 解析的插件配置
 * @returns 业务运行时配置
 */
export function toAppConfig(plugin: PluginConfig): AppConfig {
  return buildAppConfig({
    dataDir: plugin.dataDir,
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
    reviewEnabled: plugin.reviewEnabled,
    reviewProvider: plugin.reviewProvider,
    reviewModel: plugin.reviewModel,
    reviewMaxTokens: plugin.reviewMaxTokens,
    reviewKnowledgeBase: plugin.reviewKnowledgeBase,
    reviewNotificationEnabled: plugin.reviewNotificationEnabled,
  })
}
