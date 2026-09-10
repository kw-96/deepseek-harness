# Agent Note: Tool call pairing in imported Codex history

Status: implemented

[English](2026-09-10-tool-call-pairing-in-imported-history.md) | 中文

## Problem

从 Codex 导入的会话里，带有工具结果，却没有任何 assistant 消息声明过对应的工具调用。Codex 把一次调用和它的输出记录在**同一个**线程 item 里，因此 `dsh-session-import-codex` 只产出了 `tool/call` 日志记录和 `tool/result` 表面消息；模型可见的历史里于是出现了一个没有前置 `tool-call` 块的 `tool-result` 块。这样的会话原先跑在 `codex` 路由上，而该提供方容忍这种历史。

把这种会话切到严格提供方继续时，整个请求都会失败：OpenAI 兼容路由要求每条工具结果都回答一个已声明的调用，网关以 `No tool call found for function call output with call_id ...` 拒绝了这段历史。失败是整体性的——会话一条消息都发不出去——并且没有任何设置能恢复它。

## Decision

两项改动：一项针对已经落盘的历史，一项针对产生方。

`dsh-llm-pi-ai` 与 `dsh-llm-deepseek` 在重放时，把"历史未声明其调用"的工具结果改为提供方中立文本，而不是工具消息。两个适配器在遍历对话时记录自己的 assistant 消息声明过的调用 id；id 缺失的结果会变成一条 user 角色的文本块，由 `dsh-llm` 的 `unpairedToolResultText` 生成——它点名该调用，并原样保留结果自身的文本（在 pi-ai 的图片路径上还包括结果里的图片）。两个适配器都通过各自的降级通道（`onReplayDegrade`，接到 `ctx.logger.warn`）上报这次替换，因此降级是可见的，而不是静默发生。

`dsh-session-import-codex` 现在会在每个工具对之前发出"发起该调用的 assistant 消息"。这个调用并非杜撰：它的 id、名称、参数全部来自 Codex item，且该消息与它的结果同处一个 step——正是 agent loop 自己写出的形态。因此新导入的会话在任何路由上都合规。

会话不变式本就允许这一形态：`assistant/message` 只要求 step 处于打开状态，`tool/result` 只要求同 step 内存在 `tool/call`，而这个配对继续提供该事件。

## Alternatives considered

**修复持久化会话日志。** 改写导入日志——把 assistant 调用合成进已有事件，或用表面替换遮蔽孤儿区间——能让既有会话在所有路由上合规。但它会改动用户已经读过的历史，需要手工构造必须满足会话不变式的事件，而且对下一次导入毫无帮助。回放侧降级覆盖了既有会话，导入器改动则消除了成因。

**保留严格重放，用诊断信息报错。** 本 Note 之前的行为正是如此：让提供方拒绝该历史。结果是会话一条消息都发不出去，用户只拿到一条点名不透明 call id 报错。

**为缺失的调用杜撰工具名。** 在每个孤儿结果之前合成一条 assistant 工具调用（名称 `unknown`、参数为空）可以保住线协议结构。但它伪造了模型从未发出的调用，可能被按声明集合校验工具名的网关拒绝，并且在后来的转录里读起来像幻觉。

## Testing

`packages/llm/llm-pi-ai/tests/convert.spec.ts` 与
`packages/llm/llm-deepseek/tests/serialize.spec.ts` 覆盖两条路径：配对的结果仍是提供方工具消息，未配对的结果变成降级文本（含错误标记）并上报原因。
`packages/session/session-import-codex/tests/convert.spec.ts` 断言每条 `tool/result` 都引用一条由前置 assistant 消息声明的调用。

## Consequences

历史受损的会话在任何路由上都能继续工作；受影响的轮次以文本形式到达模型，因此模型仅在这些轮次上失去显式的调用／结果配对。降级以"每条结果"为粒度而非整会话，并且会记录日志。导入的转录会为每个 Codex 工具 item 增加一个表面事件，导入测试夹具也相应列出它。

## Deferred

没有无密钥录制会话快照覆盖降级重放：现有快照的会话日志都声明了各自工具结果所回答的调用，而要录制一份未声明的日志需要手工构造持久化日志。上述包级测试固定了转换行为，而导入路径现在只产出已配对的历史。
