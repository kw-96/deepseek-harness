# Agent Note: Chat 视图在轮次流式期间折叠已完成的工具调用

Status: implemented

[English](2026-09-08-chat-streaming-process-fold.md) | 中文

## Problem

Chat 视图只有在轮次关闭后才会折叠该轮的过程行（工具调用、子代理委托）：`turn-process` 折叠窗口要求 `turnClosed` 与已定稿的 answer 边界。轮次运行期间，每条已记录的调用都一直平铺在流里——长任务把整段工具历史堆在屏幕上，只有整轮跑完才会收起来。

## Decision

过程折叠现在在「没有最终 answer」的轮次中生效——运行中的轮次，以及因中断而关闭的轮次。流式折叠按成员类型而非位置：有内容的 Assistant 消息作为消息分隔始终可见；已完成的工具调用行无论位置一律折叠；其它过程成员——上下文注入行、只有思考的 Assistant 行——无论位于最新消息之前还是之后都折叠。只有运行中的调用树与进行中的模型重试行保持展开。披露行显示已完成计数（`foldedToolCalls` / `foldedSubagents`，消息计数为 0），只有思考被折叠时回退为「已思考」文案。有最终 answer 的轮次保持原有的整轮 answer 边界折叠；没有任何可折叠成员的轮次不出现披露行。Chat store 的 turn-process 条目允许 `answerStep: null`，流式披露行可展开并按代记忆状态。`latestAnswer` 不再把中断的收尾消息当作 answer，因此中断轮次保持流式规则。

## Alternatives considered

**保持只在 answer 时折叠（现状）。** 否决：抱怨点正是长轮次运行期间界面从不收敛。

**连活动调用一起折叠。** 否决：活动调用的流式输出是轮次的实时信号，藏进计数器会埋没进度。

**改为逐条自动折叠行而非复用过程披露。** 否决：已完成的调用本来就是一行的摘要；披露行是既有的「把一组收成一行」范式，复用它保持单一折叠模型。

## Consequences

折叠机制（窗口就绪、成员范围、hidden-until-found、持久化展开状态）被复用而非复制。`ChatTurnProcessPresentation` 新增 `streamFoldEnd`、`foldedToolCalls`、`foldedSubagents`；`TurnProcessOwnerProps` 新增可选流式字段；`storedTurnProcessEntry` 改为按 `(turn, answerStep)` 匹配且允许 `null`。组件测试覆盖：运行中调用旁的按类型折叠、流式披露的子代理计数、消息边界前后上下文与思考行折叠、中断轮次保持流式规则、重试行可见、无折叠成员的轮次保持全展开。`bash-abort-row` 与 `steering` 两个 e2e 断言与 golden 按新披露行为更新；其余 reload/续写类 e2e 失败在改动前代码上同样复现，与本次无关。
