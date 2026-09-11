# workorder-agent

[English](README.md)

面向网易设计工单的自研 DeepSeek Harness 插件包，提供可直接使用的易协作工单控制面：

- 按日期查询项目中的「美术完成」工单，并把字段快照、提单人和更新时间持久化到 SQLite。
- 以确定性规则核验必填字段，再按配置的 Harness 模型与提单规范知识库生成语义审核结论。
- 保存每次审核的规则结果、模型输出和 POPO 投递回执；缺项消息会在群机器人中以 `@提单人` 形式提示补全。
- 提供总览、工单查询、填写核验、数据统计、Webhook、巡检预览、POPO 消息、巡检发送和设置页面。

该包声明官方 `dsh.bundle` 元数据，由 `community/plugins` 工作区中的 `packages/workorder-agent` 构建成 tarball 后安装。

## 配置

配置以前端为主，不需要预置环境变量：

1. 首次启动后打开 `/workorder-agent`，填写 Webhook 令牌、易协作 GCP 用户 Key、POPO 群机器人地址与签名、数据目录、项目 ID，以及审核模型和提单规范知识库。
2. 保存后配置写入 Harness 的 `workorder-agent` 设置命名空间并立即重载；控制面「设置」页可继续修改模型、最大输出 token、知识库和通知开关。
3. 审核模型服务商与模型 ID 必须同时填写；两者都留空时，后台审核 Agent 继承 Harness 默认模型选择。
4. POPO 自定义群机器人只能发送到已配置群组，因此提醒消息以工单事件的提单人字段为目标文本；事件未包含提单人时回退为指派给。

环境变量仅在存在时作为首次默认值回退：`WEBHOOK_TOKEN`、`GCP_USER_KEY`、`GCP_MCP_URL`、`GCP_HOST`、`POPO_WEBHOOK_URL`、`POPO_WEBHOOK_SECRET`、`DATA_DIR`、项目 ID 系列变量，以及 `REVIEW_ENABLED`、`REVIEW_MODEL_PROVIDER`、`REVIEW_MODEL`、`REVIEW_MAX_TOKENS`、`REVIEW_KNOWLEDGE_BASE`、`REVIEW_NOTIFICATION_ENABLED`。

控制面的 `/api/admin/*` 接口不做鉴权，只由本机 Harness Web 服务提供。`enabled` 为 false 时 Host 插件不会挂载控制面；必要令牌缺失时显示引导页，补全后自动加载控制面，两者都不会拖垮 Web 宿主。

## 开发

```sh
cd community/plugins
pnpm install
pnpm --filter workorder-agent run typecheck
pnpm --filter workorder-agent run test
pnpm --filter workorder-agent run build
pnpm --filter workorder-agent run pack:check
```
