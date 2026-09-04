# Agent Note: Codex 会话导入 DSH 会话

Status: implemented

[English](2026-09-04-codex-session-import.md) | 中文

## Problem

本地使用 Codex 的用户把对话历史存在 Codex 的线程存储里,而 harness 无法展示这些对话。Web 会话列表从 session-query 提供方读取 DSH 会话,该提供方把持久化的会话日志与活跃存储做对账;因此 Codex 线程必须先变成标准的 DSH 会话——一份合法的事件日志加一个存储头——任何列表或转录界面才可能展示它。

## Decision

`@deepseek-ai/dsh-session-import-codex` 挂载一轮启动时执行的幂等导入扫描。它通过 `node:sqlite` 只读读取 Codex 的 `thread_history_1.sqlite`(`thread_items` 与 `thread_turns`),并合并可选的 `session_index.jsonl` 标题。每个线程转换为连续的 DSH 事件——`user/message`、`assistant/message`、`tool/call`/`tool/result` 对、`turn/start`/`turn/end`、`session/title` 以及结尾的 `session/end-seed`——保留 Codex 时间戳,并对工具结果与标题文本设置上限。每个线程映射到固定会话 id `codex-<线程id>`,已存在(活跃或已落盘)的会话会被跳过。

每份转换日志先经 `ctx.sessionPersistence`(create、append、flush、close)写入,再由 `ctx.sessions.create` 以同一组事件发布为活跃会话。先落盘意味着活跃发布失败也不丢数据,落盘日志是重启后的冷数据权威来源;活跃发布则让侧边栏列表经既有的 `session/created` → `api-session/added` 路径即时更新。导入在会话头记录 `cwd`(线程内最常见的命令 cwd,否则用配置的回退值),因为冷列表路径会跳过没有 cwd 的会话。

扫描为 fire-and-forget,处置器中止读取循环;线程级失败只记录警告并计入统计,不会中断整轮扫描。

## Alternatives considered

**定时器或文件监视同步。** 否决:Codex 存储是单机的历史,不是需要持续镜像的服务;幂等的启动扫描在每次重启时导入新线程,而已导入线程的后续活动不在快照导入器的范围内。

**同时导入旧版 `archived_sessions/*.jsonl` rollout。** 首个版本否决:归档格式是另一套行协议(`session_meta`/`event_msg`/`response_item`)且消息词汇不同,当前存储已覆盖用户活跃使用的线程。记为延后工作。

**仅发布活跃会话。** 否决:插件创建的会话没有 agent-loop 写入器挂接,进程重启后即丢失;落盘写入必须是导入器自己的事务。

**把 Codex 模型设置记录为 `request/header`。** 否决:rollout 没有完整可靠的提供方配置,伪造的请求头会让续接在错误假设下重放历史;续接改用部署的默认预设与模型。

## Consequences

Codex 历史无需任何逐线程操作即出现在 Web 会话列表,跨重启幂等,并受可配置上限约束。新的延后缺口由包 README 持有:旧版 rollout 导入、已导入线程的重同步,以及更深的保真度(reasoning、文件 diff、phase 元数据)。导入器注入 `sessions` 与 `sessionPersistence`,没有持久化的部署不会执行半截导入;不存在 Codex 存储是正常状态,记录日志并跳过。
