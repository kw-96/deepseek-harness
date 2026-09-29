import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { buildAppConfig, DEFAULT_REVIEW_KNOWLEDGE_BASE, type AppConfig } from '../config.js'

/** 工单 Host 插件的配置值。 */
export interface PluginConfigValues {
  enabled: boolean
  dataDir: string
  webhookToken: string
  webhookIngressEnabled: boolean
  webhookIngressHost: string
  webhookIngressPort: number
  gcpUserKey: string
  gcpUrl: string
  gcpHost: string
  popoAppId: string
  popoAppSecret: string
  popoAppReceiver: string
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
  vivoProjectDir: string
  vivoPython: string
  vivoScript: string
  vivoTargets: string
}

/**
 * 工单 Host 插件的可热更新配置。
 *
 * 0.2.0 起设置表单直接投影 profile 条目的 volatile 字段，因此每个字段都是 Loader
 * 原地提交的引用；插件用 `.get()` 读取当前生效值，无需再向设置服务注册分节。
 */
export type PluginConfig = { [K in keyof PluginConfigValues]: Volatile<PluginConfigValues[K]> }

/** Cordis / 设置卡片使用的工单插件配置模式。 */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile().description('启用工单巡检运行时'),
  dataDir: z.string().default('').volatile().description('数据目录，空则使用工作目录下 .data'),
  webhookToken: z.string().role('secret').default('').volatile().description('Webhook 入口令牌'),
  webhookIngressEnabled: z.boolean().default(false).volatile().description('启用独立事件入口，供内网易协作网关回调'),
  webhookIngressHost: z.string().default('127.0.0.1').volatile().description('独立事件入口监听地址，内网可达时填 0.0.0.0'),
  webhookIngressPort: z.number().default(3091).volatile().description('独立事件入口监听端口'),
  gcpUserKey: z.string().role('secret').default('').volatile().description('易协作 GCP 用户 Key'),
  gcpUrl: z.string().default('https://mcp.netease.com/servers/gcp/mcp').volatile().description('GCP MCP 地址'),
  gcpHost: z.string().default('promoteart.pm.netease.com').volatile().description('易协作 Host'),
  popoAppId: z.string().default('').volatile().description('机器人应用 App ID（app 通道）'),
  popoAppSecret: z.string().role('secret').default('').volatile().description('机器人应用 App Secret（app 通道）'),
  popoAppReceiver: z.string().default('').volatile().description('机器人应用接收人：用户邮箱或群 ID'),
  completedStatusId: z.number().default(6).volatile().description('美术完成状态 ID'),
  projectIdChannelArt: z.number().default(7).volatile().description('渠道美术项目 ID'),
  projectIdReturnBusiness: z.number().default(2001).volatile().description('回流业务项目 ID'),
  projectIdAiOperations: z.number().default(2004).volatile().description('AI 运营活动项目 ID'),
  reviewEnabled: z.boolean().default(true).volatile().description('启用模型提单审核'),
  reviewProvider: z.string().default('').volatile().description('审核模型服务商，留空继承 Harness 默认模型'),
  reviewModel: z.string().default('').volatile().description('审核模型 ID，留空继承 Harness 默认模型'),
  reviewMaxTokens: z.number().default(800).volatile().description('审核模型最大输出 token 数'),
  reviewKnowledgeBase: z.string().default(DEFAULT_REVIEW_KNOWLEDGE_BASE).volatile().description('提单规范知识库'),
  reviewNotificationEnabled: z.boolean().default(true).volatile().description('审核发现缺项时发送 POPO 提醒'),
  vivoProjectDir: z.string().default('').volatile().description('vivo-data 项目目录，用于读取采集结果与发起采集'),
  vivoPython: z.string().default('python').volatile().description('采集使用的 Python 解释器'),
  vivoScript: z.string().default('save_egg_party.py').volatile().description('采集脚本文件名，参数为游戏名'),
  vivoTargets: z.string().default('蛋仔派对').volatile().description('默认采集目标，多个游戏用逗号分隔'),
}) as unknown as z<PluginConfig>

/**
 * 读取当前生效的配置值。
 * @param config 插件 Config 的 volatile 引用集合
 * @returns 解包后的普通配置值
 */
export function readPluginConfig(config: PluginConfig): PluginConfigValues {
  return {
    enabled: config.enabled.get(),
    dataDir: config.dataDir.get(),
    webhookToken: config.webhookToken.get(),
    webhookIngressEnabled: config.webhookIngressEnabled.get(),
    webhookIngressHost: config.webhookIngressHost.get(),
    webhookIngressPort: config.webhookIngressPort.get(),
    gcpUserKey: config.gcpUserKey.get(),
    gcpUrl: config.gcpUrl.get(),
    gcpHost: config.gcpHost.get(),
    popoAppId: config.popoAppId.get(),
    popoAppSecret: config.popoAppSecret.get(),
    popoAppReceiver: config.popoAppReceiver.get(),
    completedStatusId: config.completedStatusId.get(),
    projectIdChannelArt: config.projectIdChannelArt.get(),
    projectIdReturnBusiness: config.projectIdReturnBusiness.get(),
    projectIdAiOperations: config.projectIdAiOperations.get(),
    reviewEnabled: config.reviewEnabled.get(),
    reviewProvider: config.reviewProvider.get(),
    reviewModel: config.reviewModel.get(),
    reviewMaxTokens: config.reviewMaxTokens.get(),
    reviewKnowledgeBase: config.reviewKnowledgeBase.get(),
    reviewNotificationEnabled: config.reviewNotificationEnabled.get(),
    vivoProjectDir: config.vivoProjectDir.get(),
    vivoPython: config.vivoPython.get(),
    vivoScript: config.vivoScript.get(),
    vivoTargets: config.vivoTargets.get(),
  }
}

/**
 * 将插件配置映射为业务运行配置。
 * @param plugin 已按 schema 解析的插件配置
 * @returns 业务运行时配置
 */
export function toAppConfig(plugin: PluginConfigValues): AppConfig {
  return buildAppConfig({
    dataDir: plugin.dataDir,
    webhookToken: plugin.webhookToken,
    webhookIngressEnabled: plugin.webhookIngressEnabled,
    webhookIngressHost: plugin.webhookIngressHost,
    webhookIngressPort: plugin.webhookIngressPort,
    gcpUserKey: plugin.gcpUserKey,
    gcpUrl: plugin.gcpUrl,
    gcpHost: plugin.gcpHost,
    popoAppId: plugin.popoAppId,
    popoAppSecret: plugin.popoAppSecret,
    popoAppReceiver: plugin.popoAppReceiver,
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
    vivoProjectDir: plugin.vivoProjectDir,
    vivoPython: plugin.vivoPython,
    vivoScript: plugin.vivoScript,
    vivoTargets: plugin.vivoTargets,
  })
}
