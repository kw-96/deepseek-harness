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

1. 打开 Harness 设置页，找到 `workorder-agent` 命名空间，填写管理令牌、
   Webhook 令牌、易协作 GCP 用户 Key、POPO 群机器人地址与签名、数据目录和
   项目 ID。令牌字段为密钥类型，界面按脱敏处理，保存后即时生效。
2. 打开插件管理界面，编辑 `workorder-agent-gcp-mcp` 的连接配置，把
   `gcp-host` 与 `gcp-user-key` 请求头填写为真实值。

环境变量仅在存在时作为首次默认值回退：`ADMIN_TOKEN`、`WEBHOOK_TOKEN`、
`GCP_USER_KEY`、`GCP_MCP_URL`、`GCP_HOST`、`POPO_WEBHOOK_URL`、
`POPO_WEBHOOK_SECRET`、`DATA_DIR` 及项目 ID 系列变量。

`enabled` 为 false 或必要令牌缺失时，Host 插件会停用运行时而不会拖垮 Web
宿主；在设置页补全配置后会自动重新挂载。

## 开发

```sh
cd community/plugins
pnpm install
pnpm --filter workorder-agent run typecheck
pnpm --filter workorder-agent run build
pnpm --filter workorder-agent run pack:check
```
