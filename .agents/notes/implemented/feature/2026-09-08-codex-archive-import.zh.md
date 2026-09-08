# Agent Note: Codex 归档 rollout 导入

Status: implemented

[English](2026-09-08-codex-archive-import.md) | 中文

## Problem

Codex 会把较早对话放在 `archived_sessions/*.jsonl`。现有导入器只读取 `thread_history_1.sqlite`，因此即使归档 rollout 含有消息、工具、工作目录元数据和已完成轮次，归档独有会话也不会出现在 DSH。

## Decision

导入器从 `state_5.sqlite` 读取 Codex 的权威线程索引（`threads.rollout_path`、`threads.cwd`、`threads.name`、`threads.archived`）。对每条索引线程读取其 rollout 文件，把 `session_meta`、`turn_context`、`event_msg` 和 `response_item` 记录规范化为当前 converter 使用的同一 `CodexThreadRecord`。索引条目还覆盖当前 SQLite 存储或旧归档目录漏掉的线程。线程级 cwd 与整理名覆盖派生值，因此 DSH 工作区分组与 Codex 项目视图一致，归档线程也保留整理后的标题。当前 SQLite 线程与归档 rollout 共享会话 id 时，当前线程优先并跳过归档副本。

## Alternatives considered

**把归档文件作为不透明转录附件导入。** 不采用：它们已经携带足够的消息、工具、轮次和 cwd 数据，可以进入标准 DSH 会话投影。

**用不同 DSH id 同时导入当前与归档副本。** 不采用：一个 Codex 对话会出现两次，其工作区归属也可能分叉。

## Consequences

归档独有和仅存在于索引的 Codex 对话会成为普通 DSH 会话，并归入 Codex 的线程级项目目录。没有当前映射的旧 rollout 条目仍不进入转录；两个来源都存在时，当前 SQLite 线程继续提供权威事件内容。
