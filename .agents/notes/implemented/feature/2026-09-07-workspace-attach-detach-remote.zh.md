# Agent Note: 经 Remote 暴露 Workspace attach/detach

Status: implemented

English | [中文](2026-09-07-workspace-attach-detach-remote.zh.md)

## 问题

Codex 侧栏「迁到项目」调用了 `insertSessionBefore`，它只能重排已归属同一工作区的会话。工作区 path 全局唯一，同 cwd 的另一工作区几乎不存在；未分组会话也无法从 GUI 归入匹配工作区。Host 域早已有 `attachSession` / `detachSession`，但 Workspace Controller Remote 与客户端 `IWorkspaces` 未暴露。

## 决策

在 Workspace Controller Remote 上暴露 `workspace/attachSession` 与 `workspace/detachSession`。客户端 `IWorkspaces.attachSession` / `detachSession` 对齐这两个动词并 upsert 返回行。attach 仍要求会话 header 的 cwd 等于工作区 path；detach 移除归属，会话进入未分组。跨目录迁项目（改会话 cwd）仍不在范围。

Codex-shell「项目」子菜单：对 path 匹配目标调用 attach；「移到未分组」调用 detach；目录不一致项禁用并附原因。

## 备选方案

- 仅做诚实禁用 UI、不加 Host 动词：未分组 → 匹配工作区无法闭环。
- 让未归属会话走 `insertSessionBefore` 兼 attach：混淆重排与归属，错误码不清晰。
- 侧栏改会话 cwd：需要新的 Host 协议，超出本决策。

## 后果

GUI 与 fixture 可变更归属而无需 Host 脚本。API 目录与 Typert 客户端面随两动词再生。跨 cwd「迁项目」在 cwd 变更协议出现前保持禁用。

## 必要验证

- Host：cwd 匹配 attach 成功；不匹配返回 `workspace/attach-invalid`；detach 后为未分组。
- 客户端 model 在 attach/detach 后 upsert。
- Codex-shell 菜单：已归属时显示移到未分组；目录不一致项禁用。
