# workorder-agent

[English](README.md)

面向网易设计工单的自研 DeepSeek Harness 插件包：

- 通过易协作 GCP MCP 查询日期范围内「美术完成」状态的工单。
- 检查必填字段、持久化工单快照，并按 `updated_on` 增量刷新。
- 生成可复核预览，按负责人聚合后通过 POPO 群机器人发送。
- 在 `/workorder-agent` 下挂载独立控制面，包含总览、工单、Webhook 事件、
  复核结果、POPO 消息、巡检发送和设置页面。

该包声明官方 `dsh.bundle` 元数据，由 `community/plugins` 工作区中的
`packages/workorder-agent` 构建成 tarball 后安装。

## 配置

配置以前端为主，不需要预置环境变量：

1. 首次启动后打开 `/workorder-agent`，在引导页填写管理令牌、Webhook 令牌、
   易协作 GCP 用户 Key、POPO 群机器人地址与签名、数据目录和项目 ID。
2. 保存后配置写入 Harness 的 `workorder-agent` 设置命名空间并立即重载，随后
   该地址即为独立工单控制面。

Agent 语义复核所需的 `gcp` MCP 连接不随本页创建，需要时可在插件管理界面手动
添加并填写 `gcp-host` 与 `gcp-user-key` 请求头。

环境变量仅在存在时作为首次默认值回退：`ADMIN_TOKEN`、`WEBHOOK_TOKEN`、
`GCP_USER_KEY`、`GCP_MCP_URL`、`GCP_HOST`、`POPO_WEBHOOK_URL`、
`POPO_WEBHOOK_SECRET`、`DATA_DIR` 及项目 ID 系列变量。

`enabled` 为 false 时 Host 插件不会挂载控制面；必要令牌缺失时显示引导页，
补全后自动加载控制面，两者都不会拖垮 Web 宿主。

## 开发

```sh
cd community/plugins
pnpm install
pnpm --filter workorder-agent run typecheck
pnpm --filter workorder-agent run build
pnpm --filter workorder-agent run pack:check
```
