# Agent Note: 工作区显式归属与跨项目移动会话

Status: implemented

中文 | [English](2026-09-07-workspace-explicit-membership.md)

## 问题

工作区成员关系要求会话 header 的 cwd 能解析到工作区路径。Codex 式侧栏因此只能把会话移入 cwd 匹配的项目，其它项目一律以“路径不匹配”禁用，用户无法像 Codex 那样跨项目整理会话。

## 决策

成员关系改为显式的持久化账目。`WorkspaceEntity.attachSession` 在把 id 前置前只校验会话仍存在（经 header 索引）；`sessionIds` 投影与 `mutate` 写链不再按规范化 cwd 过滤。cwd 索引仅保留给首次启动的 bootstrap，用于按目录归组历史会话。

`ctx.workspaceController` 新增 `moveSession({ sessionId, workspaceId })` Remote：在一个串行命令槽内先把会话从其当前所属项目移除（若有），再附加到目标项目，从而保证一个会话不会被两个工作区记账。Codex 侧栏菜单现在把其它所有项目都列为移动目标，把会话拖到另一项目也走 `moveSession`；同项目内排序仍用 `insertSessionBefore`。

会话自身的 cwd、存储日志与 system-prompt `cwd` 变量有意保持不变：移动项目只改导航分组，不改会话运行目录。工作区内新建会话仍继承该工作区路径作为 cwd。

## 曾考虑的替代方案

**改写会话 header cwd 并迁移日志。** 不采用：jsonl 后端把 header 存进不可变且带校验的首帧；仅为导航移动而重写它会引入回放与持久化风险，却并未新增真实能力。

## 后果

`Workspace.sessionIds` 不再保证 `cwd === path`。`dsh-codex-shell` 0.6.5 依赖新增的 `moveSession` Remote；旧版插件仍能做同项目 attach，但无法跨项目移动。
