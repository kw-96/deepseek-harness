# Agent Note: Codex 式侧栏项目层级

Status: implemented

[English](2026-09-08-codex-sidebar-project-tier.md) | 中文

## Problem

`codex-shell` 侧栏只按工作区目录分组会话，因此一个在 Codex 侧已经整理成项目的侧栏，导入后会被压平成目录列表。导入的会话保留了线程级 `cwd`，但没有东西重建“一个项目名下挂多个检出目录”的项目层。

## Decision

`dsh-workspace` 在已有 `workspaces` 表之外新增持久化 `projects` 表。一条 `Project` 记录保存显示 `name` 和有序 `roots` 列表；工作区归入最长 root 前缀命中其规范路径的项目，因此一个逻辑项目可以拥有多个检出目录。domain 版本保持 `2`，因为 `projectIds` 默认是空列表，旧存储原样读取。Codex 导入读取 `state_5.sqlite` 的 `projects` 和 `project_roots`，按名称对账一个项目并更新其 roots。侧栏把项目文件夹渲染在工作区文件夹之上，两级都可折叠，并通过 workspace 主机远程与客户端菜单支持新建、重命名、改 roots 和删除项目。

## Alternatives considered

**只按第一段路径分组。** 不采用：Codex 项目拥有任意 `project_roots`（包括 `e:\KW` 这种宽 root），且一个项目有多个 root；单目录启发式无法表达。

**在客户端推导项目而不持久化。** 不采用：重命名、root 编辑和排序必须跨重启保留，且 Codex 对账要与会话导入一同持久化。

## Consequences

侧栏可以镜像 Codex 的“项目 / 工作区 / 会话”结构，同时仍支持 DSH 新建项目和编辑 root。目录不被任何 root 命中的工作区保持未分组。现有存储以空项目列表载入，只在下次导入对账或显式新建时迁移。
