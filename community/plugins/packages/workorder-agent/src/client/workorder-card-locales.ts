/** 工单设置卡的中英文文案。 */
export const zh = {
  title: '工单巡检',
  description: '配置易协作查询、POPO 通知与独立工单控制面。',
  enabled: '启用',
  adminToken: '管理令牌',
  webhookToken: 'Webhook 令牌',
  gcpUserKey: '易协作 GCP 用户 Key',
  popoWebhookSecret: 'POPO 群机器人签名',
  gcpUrl: '易协作 MCP 地址',
  gcpHost: '易协作 Host',
  popoWebhookUrl: 'POPO 群机器人地址',
  dataDir: '数据目录',
  completedStatusId: '美术完成状态 ID',
  projectIdChannelArt: '渠道美术项目 ID',
  projectIdReturnBusiness: '回流业务项目 ID',
  projectIdAiOperations: 'AI 运营活动项目 ID',
  configured: '已配置',
  unconfigured: '未配置',
  invalidIds: '项目和状态 ID 必须为正整数。',
  syncHint: '保存后会同步维护名为 gcp 的 MCP 连接；密钥不会回显。',
  discard: '放弃修改',
  save: '保存',
  saving: '保存中…',
} as const

/** 工单设置卡使用的文案键。 */
export type WorkorderLocaleKey = keyof typeof zh

/** English copy paired with the Chinese source keys. */
export const en: Record<WorkorderLocaleKey, string> = {
  title: 'Workorder inspection',
  description: 'Configure EasyWork queries, POPO notifications, and the standalone control panel.',
  enabled: 'Enabled',
  adminToken: 'Admin token',
  webhookToken: 'Webhook token',
  gcpUserKey: 'EasyWork GCP user key',
  popoWebhookSecret: 'POPO group robot signature',
  gcpUrl: 'EasyWork MCP URL',
  gcpHost: 'EasyWork host',
  popoWebhookUrl: 'POPO group robot URL',
  dataDir: 'Data directory',
  completedStatusId: 'Completed-art status ID',
  projectIdChannelArt: 'Channel art project ID',
  projectIdReturnBusiness: 'Return business project ID',
  projectIdAiOperations: 'AI operations project ID',
  configured: 'Configured',
  unconfigured: 'Not configured',
  invalidIds: 'Project and status IDs must be positive integers.',
  syncHint: 'Saving also maintains the gcp MCP connection; secrets are never echoed.',
  discard: 'Discard',
  save: 'Save',
  saving: 'Saving…',
}
