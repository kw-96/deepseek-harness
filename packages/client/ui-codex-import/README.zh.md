---
description: "Codex 导入器的 Web 设置卡片：自动同步开关、手动导入动作与持久化导入历史，位于「插件」配置页。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-codex-import

[English](README.md) | 中文

## 概述

`dsh-client-ui-codex-import` 在 Web 的**插件**配置页渲染 Codex 导入卡片，服务于 [`dsh-session-import-codex`](../../session/session-import-codex/README.zh.md) 提供的 `codex-import` 设置命名空间。卡片包含绑定该命名空间 `autoSync` 字段的同步开关、执行一次扫描的**立即导入**动作，以及由 `codexImport` Remote 返回的持久化运行历史；每轮运行可展开为它导入的会话，点击即可打开。宿主侧是空插件，仅用于让该浏览器特性在 Loader 叠加层中可寻址。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在 Web 客户端打开**设置 → 插件**，展开 `codex-import` 卡片。与其它插件卡片一致，它默认收起；展开后显示：

- **自动同步** — 通过设置作用域写入命名空间的 `autoSync` 字段。打开后宿主立即执行一次扫描，之后按配置间隔重复；关闭后只剩手动动作作为触发点。
- **立即导入** — 调用 `codexImport` Remote 的 `run()` 并报告本次运行。无论开关状态如何，该动作始终可用。
- **导入历史** — `history()` 返回的运行记录，最新在前，每轮可折叠展开其导入的会话。选中某个会话即在对话区打开它。

卡片本身不含导入逻辑：读取 Codex、转换线程与写入会话都发生在 [`dsh-session-import-codex`](../../session/session-import-codex/README.zh.md)。

-----

<a id="understand-the-implementation"></a>
## 理解实现

`apply` 注册 `codex-import` 词典与一个以该命名空间为 key 的 `settings.plugin.item` 条目。被注册的组件收到由控制器构造的注入面：store 快照（忙碌标志、最近一次运行、历史）、当前设置作用域值，以及切换同步、运行导入、打开会话与选择卡片等回调。控制器订阅设置作用域，在每轮运行后刷新历史，并随插件 fiber 一并释放订阅与 slot 注册。

由于卡片渲染在「插件」页内，它出现在任何注册了该页的位置；本包不向对话区或侧栏注册任何内容。

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Codex 会话导入](../../../docs/subsystems/session-import.zh.md) — 本卡片驱动的导入会话词表、`codexImport` Remote 与 `autoSync` 设置命名空间。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

**运行时不变式：** 未发布伴随包。本包注册一张设置卡片及其词典，不持有跨插件可变状态，其注入面即控制器的快照与回调。

</details>

-----

<a id="model-experience"></a>
## 模型体验

间接地，经由模型之后继续的导入会话日志。

#### KV Cache 影响

卡片本身不构建上下文：它触发宿主扫描并读回运行记录。导入的用户、助手与工具消息，只有在某个 Agent 继续其中一个会话时才进入模型请求，而模型可见的新增内容由 agent loop 与该会话的 preset 拥有。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- **仅浏览器侧** — 除空的 `apply` 外，本包在宿主面不贡献任何内容；没有「插件」页的客户端不会渲染该卡片。
- **一个命名空间一张卡片** — 卡片绑定 `codex-import`；第二个导入器需要自己的命名空间与卡片。
- **历史只读** — 卡片展示已记录的运行，但不能删除它们；保留策略归宿主包所有。
- **无进度上报** — 一次扫描只报告结束后的运行，因此长时间导入期间只显示忙碌状态直到 Remote 返回。
