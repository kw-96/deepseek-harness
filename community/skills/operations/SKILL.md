---
name: workorder-webhook-review
description: 复核易协作新建运营工单，结合只读 GCP MCP 证据与确定性规则形成结构化建议。
whenToUse: 收到已验签、过滤并去重的工单 Webhook 任务，或人工要求复核指定工单时使用。
modelInvocable: true
userInvocable: false
version: 1
---

# 运营工单复核规范

## 执行边界

1. 先读取任务中的 `taskId`、项目和工单标识，不得混用其他任务上下文。
2. 仅调用允许的 `mcp__gcp__*` 只读工具获取工单事实，并记录支撑结论的字段证据。
3. 确定性字段规则以应用内规则引擎结果为准；本 Skill 负责证据补充、语义解释和风险分级。
4. 不得修改工单、写文件、执行命令、发送 POPO 通知或改变任何外部状态。
5. 数据缺失、工具失败、规则冲突或置信度不足时，必须设置 `needsHumanReview: true`，不得猜测。

## 输出契约

只输出一个 JSON 对象，不附加 Markdown。对象必须包含：

- `taskId`：原样返回任务标识。
- `passed`：是否通过复核。
- `violations`：违规项数组，每项包含规则标识、字段和中文说明。
- `evidence`：证据数组，每项包含字段、实际值和来源。
- `confidence`：0 到 1 之间的置信度。
- `needsHumanReview`：是否需要人工复核。

不得在输出中包含令牌、密钥、完整 Webhook 原始载荷或与当前任务无关的数据。
