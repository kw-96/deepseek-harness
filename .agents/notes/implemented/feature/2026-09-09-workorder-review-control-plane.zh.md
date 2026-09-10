# Agent Note: 工单审核持久化模型结论与 POPO 投递结果

Status: implemented

[English](2026-09-09-workorder-review-control-plane.md) | 中文

## Problem

易协作 Webhook 处理原本保存字段快照和确定性缺项结果，但 Harness Agent 的文字结论不会关联到对应工单，也无法被操作人员查看；群机器人流程同样没有识别需要补全内容的提单人。

## Decision

`workorder-agent` 在每个工单快照中保存提单人，并把每次 Webhook 或手动审核写入 `issue_reviews`，记录确定性违规项、模型状态和输出、POPO 投递状态、消息任务标识及投递错误。

Host 配置拥有可选的服务商与模型 ID 配对、最大输出 token、知识库文本、模型审核开关和通知开关。配对已配置时后台 Agent 接收明确的 `agentOptions` 路由，否则使用 Harness 默认模型选择。它串行执行审核回合后再读取新写入的 Assistant 结果，避免并发 Webhook 与手动审核交换结论。

审核提示接收不可变工单快照和已配置知识库，不调用工具也不修改易协作。确定性规则仍是通知依据；规则发现缺项且自动发送已启用时，POPO 群机器人发送以 `@提单人` 为目标的消息。Webhook 载荷中的作者字段优先，其次使用已缓存的提单人，最后回退为指派给。

控制面提供按日期同步易协作、手动审核、审核记录与详情、统计、模型和知识库配置、POPO 消息回执。保存审核配置会更新 Host 设置命名空间并重新挂载运行时。

## Alternatives considered

**只在 Agent 会话中保留模型输出。** 否决：操作人员无法将临时后台会话结果关联到工单、检查发送失败，或审计之后的手动复核。

**让模型通过 MCP 工具再次读取易协作。** 否决：Webhook 处理器已经校验并存储来源快照；传入不可变记录可以避免额外远端读取，并把模型权限限制为输出审核文字。

**把 POPO 群机器人视为私聊客户端。** 否决：已配置 Webhook 只会投递到群组。已记录和展示的行为是向提单人文本定向的群消息，未读取到提单人时使用指派给回退。

## Consequences

SQLite schema version 4 增加 `issues.submitter_name`，version 5 增加不可变审核记录。已有工单行会保留空提单人，直到后续同步或 Webhook 刷新。

语义结论可以失败，但确定性审核与其记录仍然完成。POPO 发送失败或被阻止时，状态保持可见，并沿用现有消息任务流程续发，而不是由 Webhook 工作器静默重试。

## Testing

`pnpm --dir community/plugins --filter workorder-agent run test` 覆盖模型路由、审核持久化、提单人提醒消息、通知状态、页面脚本语法、配置校验、迁移和既有巡检行为。
