# workorder-agent

[English](README.md) | 中文

面向网易设计工单的自研 DeepSeek Harness 插件包，提供可直接使用的易协作工单控制面 Ticket Hub：

- 按日期查询项目中的「美术完成」工单，并把字段快照、提单人和更新时间持久化到 SQLite。
- 以确定性规则核验必填字段，再按配置的 Harness 模型与提单规范知识库生成语义审核结论。
- 保存每次审核的规则结果、模型输出和 POPO 投递回执；缺项消息会在群机器人中以 `@提单人` 形式提示补全。
- 提供总览、工单查询、填写核验、数据统计、vivo 案例、Webhook、巡检预览、POPO 消息、巡检发送和设置页面。
- 集成 vivo 优秀案例：读取 vivo-data 项目的采集产物（轮次、案例、截图）并入库，支持跨轮次对比、筛选，以及从控制面发起采集与推送结果到 POPO。

该包声明官方 `dsh.bundle` 元数据，由 `community/plugins` 工作区中的 `packages/workorder-agent` 构建成 tarball 后安装。

## 配置

配置以前端为主，不需要预置环境变量：

1. 首次启动后打开 `/workorder-agent`，填写 Webhook 令牌、易协作 GCP 用户 Key、POPO 群机器人地址与签名、数据目录、项目 ID，以及审核模型和提单规范知识库。
2. 保存后配置写入 Harness 的 `workorder-agent` 设置命名空间并立即重载；控制面「设置」页可继续修改模型、最大输出 token、知识库和通知开关。
3. 审核模型服务商与模型 ID 必须同时填写；两者都留空时，后台审核 Agent 继承 Harness 默认模型选择。
4. POPO 自定义群机器人只能发送到已配置群组，因此提醒消息以工单事件的提单人字段为目标文本；事件未包含提单人时回退为指派给。

环境变量仅在存在时作为首次默认值回退：`WEBHOOK_TOKEN`、`WEBHOOK_INGRESS_ENABLED`、`WEBHOOK_INGRESS_HOST`、`WEBHOOK_INGRESS_PORT`、`GCP_USER_KEY`、`GCP_MCP_URL`、`GCP_HOST`、`POPO_WEBHOOK_URL`、`POPO_WEBHOOK_SECRET`、`DATA_DIR`、项目 ID 系列变量，以及 `REVIEW_ENABLED`、`REVIEW_MODEL_PROVIDER`、`REVIEW_MODEL`、`REVIEW_MAX_TOKENS`、`REVIEW_KNOWLEDGE_BASE`、`REVIEW_NOTIFICATION_ENABLED`。

控制面的 `/api/admin/*` 接口不做鉴权，只由本机 Harness Web 服务提供。`enabled` 为 false 时 Host 插件不会挂载控制面；必要令牌缺失时显示引导页，补全后自动加载控制面，两者都不会拖垮 Web 宿主。

## 易协作事件入口

控制面与宿主 Web 服务共用监听地址，而宿主默认只绑定 `127.0.0.1`（`--host 0.0.0.0` 被 Harness 明确拒绝），内网中的易协作网关无法直接回调。需要实时事件时启用独立事件入口：

1. 打开 `webhookIngressEnabled`，按部署填 `webhookIngressHost`（本机可达内网时填 `0.0.0.0`，仅本机自测填 `127.0.0.1`）与 `webhookIngressPort`。
2. 该入口只服务 `POST /webhooks/gcp/<webhookToken>`，其余路径一律 404；它在易协作 Webhook 中的地址为 `http://<本机或服务器内网IP>:<webhookIngressPort>/webhooks/gcp/<webhookToken>`。
3. 触发事件勾选「单 → 新增」与「单 → 编辑」：插件处理新建事件，以及把状态改为「美术完成」的编辑事件；其余事件会被忽略，忽略原因与载荷摘要显示在控制面「Webhook 事件」页的入口回调记录中。
4. 事件只入库、不自动处理；要让事件触发规则核验、模型审核与 POPO 提醒，需在控制面「设置」页打开「Webhook 处理」（以及按需打开「自动发送」）。
5. URL 最后一段就是唯一凭据，建议使用随机长令牌；部署到服务器后把 IP 换成服务器内网地址即可，其余配置不变。

未启用入口时，插件仍可通过「定时巡检」与「手动同步」按期望交付时间拉取易协作工单，只是没有实时性。

## vivo 优秀案例

`vivoProjectDir` 指向 vivo-data 项目根目录（其 `output/<轮次>/data.json` 与截图是唯一数据源）：

1. 「vivo 案例」页读取并入库每轮采集结果，按「游戏 + 资源位 + 素材」去重保留最高点击率，并标注相对更早轮次的变化与新上榜；支持按游戏、资源位筛选与查看截图。
2. 「立即采集」以配置的 `vivoPython` 与 `vivoScript`（默认 `save_egg_party.py`）在项目目录下拉起采集，参数为游戏名；同时只允许一个任务，日志尾部在页面回显，结束后自动同步新产出。
3. 「推送本轮到 POPO」把最新一轮命中案例（含新上榜与 CTR 变化）通过既有 POPO 投递链路发到群。
4. 采集依赖本机 Python + `playwright`（含 Chromium）与已登录的浏览器配置目录；登录态失效时先在项目目录执行 `python main.py --login` 人工登录一次。

## 开发

```sh
cd community/plugins
pnpm install
pnpm --filter workorder-agent run typecheck
pnpm --filter workorder-agent run test
pnpm --filter workorder-agent run build
pnpm --filter workorder-agent run pack:check
```
