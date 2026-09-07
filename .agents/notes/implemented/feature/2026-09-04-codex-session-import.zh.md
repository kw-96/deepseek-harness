# Agent Note: Codex 会话导入 DSH 会话

Status: implemented

[English](2026-09-04-codex-session-import.md) | 中文

## Problem

本地使用 Codex 的用户把对话历史存在 Codex 的线程存储里,而 harness 无法展示这些对话。Web 会话列表从 session-query 提供方读取 DSH 会话,该提供方把持久化的会话日志与活跃存储做对账;因此 Codex 线程必须先变成标准的 DSH 会话——一份合法的事件日志加一个存储头——任何列表或转录界面才可能展示它。

## Decision

`@deepseek-ai/dsh-session-import-codex` 默认提供手动导入。其 `autoSync` 设置默认值为 `false`；开启后会立即导入一次，并启用配置的定时扫描。它通过 `node:sqlite` 只读读取 Codex 的 `thread_history_1.sqlite`（`thread_items` 与 `thread_turns`），并合并可选的 `session_index.jsonl` 标题。每个线程转换为连续的 DSH 事件——`user/message`、`assistant/message`、`tool/call`/`tool/result` 对、`turn/start`/`turn/end`、`session/title` 以及结尾的 `session/end-seed`——保留 Codex 时间戳，并对工具结果与标题文本设置上限。每个线程映射到固定会话 id `codex-<线程id>`。

每份转换日志先经 `ctx.sessionPersistence`(create、append、flush、close)写入,再由 `ctx.sessions.create` 以同一组事件发布为活跃会话。先落盘意味着活跃发布失败也不丢数据,落盘日志是重启后的冷数据权威来源;活跃发布则让侧边栏列表经既有的 `session/created` → `api-session/added` 路径即时更新。导入在会话头记录 `cwd`(线程内最常见的命令 cwd,否则用配置的回退值),因为冷列表路径会跳过没有 cwd 的会话。持久化后，`workspaceRegistry` 会创建或复用匹配的规范化目录并挂入会话，使侧栏工作区分组拥有显式且持久的成员关系。重复的手动导入会跳过已有会话日志，但会重复这项幂等挂接，从而修复此前未分组的导入会话。

扫描为 fire-and-forget,处置器中止读取循环;线程级失败只记录警告并计入统计,不会中断整轮扫描。

## Alternatives considered

**每次主机启动时执行导入扫描。** 否决：打开 Web profile 不应在用户未明确选择导入时创建可见会话。设置开关仍保留可选的即时和定时导入。

**文件监视同步。** 否决：Codex 存储是单机的历史，不是需要持续镜像的服务；已导入线程之后的活动仍不属于快照导入器范围。

**同时导入旧版 `archived_sessions/*.jsonl` rollout。** 首个版本否决:归档格式是另一套行协议(`session_meta`/`event_msg`/`response_item`)且消息词汇不同,当前存储已覆盖用户活跃使用的线程。记为延后工作。

**仅发布活跃会话。** 否决:插件创建的会话没有 agent-loop 写入器挂接,进程重启后即丢失;落盘写入必须是导入器自己的事务。

**把 Codex 模型设置记录为 `request/header`。** 否决:rollout 没有完整可靠的提供方配置,伪造的请求头会让续接在错误假设下重放历史;续接改用部署的默认预设与模型。

## Consequences

Codex 历史在手动导入或显式选择自动同步后出现，跨重启幂等，并受可配置上限约束。已有导入会话会在下一次手动运行时恢复工作区分组，前提是其记录的 `cwd` 仍可解析为目录。新的延后缺口由包 README 持有：旧版 rollout 导入、已导入线程的重同步，以及更深的保真度（reasoning、文件 diff、phase 元数据）。导入器注入 `sessions`、`sessionPersistence` 与 `workspaceRegistry`，没有持久化或工作区归属能力的部署不会执行半截导入；不存在 Codex 存储是正常状态，记录日志并跳过。
