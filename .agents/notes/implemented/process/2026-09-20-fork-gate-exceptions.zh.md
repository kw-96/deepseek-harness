# Agent Note: 无 GitHub 工作流的 fork 的门禁例外

Status: implemented

[English](2026-09-20-fork-gate-exceptions.md) | 中文

## Problem

本 checkout 有意移除了 `.github/workflows/**`：保持这些文件不存在，本身就是让 GitHub Actions 完全不触发的前提。三个维护文件门禁默认上游布局，因此本 fork 上有四项文档门禁持续为红——`Workspace` 类型块仍在描述 alpha.2 之前的归属规则；历史笔记与 `docs/development.md` 链接到已删除的工作流；历史日志带有裸提交标识；内置内容触发禁用词规则。

## Decision

每个门禁各自得到最窄的适用例外：

- `verify-md-links` 跳过 `.github/workflows/` 下的链接目标。历史实现笔记保留原文。
- `verify-concrete-terms` 排除 `.runtime/`（内置的 Node 分发物，携带 npm 自带文档）与 `community/skills/`（原样引入的第三方 skill 内容）。
- 本仓自有的 `session-import-codex` 包中的禁用词改为更名而非排除（其常量现名 `CODEX_ORIGIN`），使该包仍受规则约束。
- `docs/subsystems/workspace.md` 与 `workspace.zh.md` 中的 `Workspace` 类型块按当前源码重新记录，周边叙述也去掉了已退役的候选账本措辞。
- 历史日志中的裸提交标识改为等价文字描述。

## Alternatives considered

**恢复 `.github/workflows/**`。** 否决：删除是一项部署决定，恢复这些文件会让 GitHub Actions 在本 fork 上重新运行。

**改写历史笔记与日志，抹掉所有失效引用。** 否决：`.agents/notes/implemented/**` 记录的是写下当时的事实，改写会毁掉这份记录。

**连内置内容里的禁用词一起更名。** 否决：`.runtime/` 与 `community/skills/` 是原样保留的上游文本，其措辞不由我们改动。

## Consequences

若要撤销删除工作流，这里无需任何反向改动：链接检查器的跳过按目标路径判定，因此这些文件一旦恢复存在，相关目标即刻恢复检查。
