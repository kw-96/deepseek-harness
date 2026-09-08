# Agent Note: Codex 导入对账

Status: implemented

[English](2026-09-07-codex-import-reconciliation.md) | 中文

## Problem

Codex 导入会从 `thread_history_1.sqlite` 读取每条线程，但固定 DSH id 一旦创建就被视为最终状态。Codex 之后新增的条目、当前 cwd 变化，以及未出现在 `session_index.jsonl` 的线程都不会被对账。最后一种情况会生成没有标题的导入日志，而普通 DSH 工作区投影会把它当 blank session 隐藏。

## Decision

每一轮扫描都会转换每个非空 Codex 线程，并将完整事件日志与 header 同已存储的 `codex-<threadId>` 快照比较。整理名缺失时回退到索引标题，再回退到第一条用户消息。`state_5.sqlite` 中 Codex 的线程级 cwd 写入 header cwd；没有索引条目时回退到最新绝对 command 或 MCP cwd。无变化快照只修复工作区成员关系。变化快照会替换持久 JSONL artifact，并替换非 Agent 所有的活跃会话；目标工作区挂入前，所有旧工作区账户先 detach 该 id。Agent 所有的会话会延后并在下一轮报告。

`SessionPersistence.replace` 是显式 opt-in 能力：不支持的 provider 会失败大声。JSONL 通过持久 replacement journal 实现它，因此跨 cwd 迁移会在再次发现会话前恢复旧 artifact 或完成清理。

## Alternatives considered

**保持已有会话不可变，只额外挂入另一个工作区。** 不采用：工作区成员关系会校验不可变 header cwd，无法表示已变化的 Codex 项目。

**每次 Codex 线程变化都创建新的 DSH id。** 不采用：会重复历史、破坏稳定会话链接，并留下陈旧工作区条目。

**不保留恢复状态地原地重写 JSONL 文件。** 不采用：跨目录 cwd 迁移中断时可能丢失可发现 artifact。

## Consequences

当前 Codex 线程保留一个 DSH id，同时其转录和项目归属会在后续导入中收敛。用户开启自动同步后，默认 60 秒扫描会应用相同对账；`syncIntervalMs: 0` 会显式关闭重复扫描。设置卡会区分新导入、更新、无变化和活跃会话延后。旧版 `archived_sessions` 导入与更深的转录保真度仍是独立包限制。
