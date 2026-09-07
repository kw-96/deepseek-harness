---
description: "将本地 Codex 线程导入 DeepSeek Harness 会话——Codex 的消息、工具调用、标题与轮次边界成为出现在 Web 会话列表中的 DSH 会话——面向 Codex 用户与导入器维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-import-codex

[English](README.md) | 中文

## 概述

`dsh-session-import-codex` 在你选择“立即导入”时，把本地安装的 Codex 线程导入为 DeepSeek Harness 会话。它把每个线程转换为标准 DSH 事件日志，经会话持久化后端落盘，再作为活跃会话发布，并按会话头的 `cwd` 创建或复用对应的 DSH 工作区。Web 会话列表因此会把导入的 Codex 对话归入其工作目录。自动导入默认关闭；开启设置卡片的开关后会先导入一次，再按配置间隔执行。它不是与 Codex 的双向实时同步。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在组合里挂载本包（组合需先包含会话持久化和 `dsh-workspace`；插件注入 `sessions`、`sessionPersistence` 与 `workspaceRegistry`）。通过设置卡片的“立即导入”开始导入；自动导入需要显式开启。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-session-import-codex'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `codexHome` | `CODEX_HOME`,其次 `~/.codex` | 包含 `thread_history_1.sqlite` 与 `session_index.jsonl` 的目录 |
| `cwd` | 进程 cwd | 线程没有命令 cwd 时,写入导入会话头的绝对工作目录 |
| `maxToolResultChars` | `20,000` | 导入工具结果文本的最大 UTF-16 码元数 |
| `maxTitleChars` | `300` | 导入会话标题的最大 UTF-16 码元数 |
| `syncIntervalMs` | `0`（关闭） | 设置卡片同步开关开启时的定时重扫间隔 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-import-codex)是每个可接受字段的权威来源。

### 导入如何运行

- 自动导入默认关闭。开启 `autoSync` 后会立即执行一轮扫描，再按 `syncIntervalMs` 重复；“立即导入”始终执行一轮扫描。
- 每个导入会话使用固定 id：`codex-` 加 Codex 线程 id。重复扫描不会产生副本，并会在成员关系缺失时将已有导入会话挂入匹配的工作区。
- 会话标题来自 Codex 的 `session_index.jsonl`(存在时);会话 `cwd` 取线程内出现最多的命令 cwd,否则用配置的 `cwd`。
- 导入会话同时落盘并发布为活跃会话，随后挂入具有相同规范化 `cwd` 的工作区：它会出现在 Web 会话列表的对应工作目录下，并在重启后保留。
- 单个线程读取或转换失败只记录警告并跳过,不会中断整轮扫描。
- 没有 Codex thread store 时,插件记录"无可导入"并正常加载。

### 设置卡片与 Remote

插件提供 `codex-import` 设置命名空间（一个字段 `autoSync`，默认 `false`）和带有 `run()`、`history()` 的 `codexImport` Remote 命名空间。配套客户端包 `@deepseek-ai/dsh-client-ui-codex-import` 在 Web **插件**配置标签中渲染同步开关、手动导入按钮以及带逐会话打开按钮的持久导入历史。该开关同时控制即时自动扫描和定时重扫（`syncIntervalMs`）；手动按钮始终可用。

### 条目映射

| Codex 条目 | DSH 事件 |
|---|---|
| `userMessage` | `user/message`,携带其文本块 |
| `agentMessage` | `assistant/message`(每条代理消息对应一个 DSH step) |
| `commandExecution` | `tool/call` + `tool/result`,工具名 `Bash`,参数 `{ command, cwd }` |
| `mcpToolCall` | `tool/call` + `tool/result`,工具名 `mcp.<server>.<tool>` |
| `webSearch` | `tool/call` + `tool/result`,工具名 `web_search`,参数 `{ query }` |
| `fileChange` | `tool/call` + `tool/result`,工具名 `codex.fileChange`,参数 `{ paths, kinds }` |
| `imageView` | `tool/call` + `tool/result`,工具名 `codex.imageView`,参数 `{ path }` |
| `reasoning`、`contextCompaction`、未知类型 | 跳过——不属于对话正文 |

已完成的 Codex 轮次以 `completed` 收尾;其余轮次以 `aborted` + `legacy` 原因收尾,与导入历史的既有词汇一致。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

### 读取路径

[`src/sqlite.ts`](src/sqlite.ts) 的 `loadCodexThreads` 通过 `node:sqlite` 以只读方式打开 `thread_history_1.sqlite`,读取 `thread_items` 与 `thread_turns` 两表,再合并可选的 `session_index.jsonl` 标题。数据库不存在时返回 `undefined`——从没运行过 Codex 的机器不算错误。

### 转换

[`src/convert.ts`](src/convert.ts) 的 `convertCodexThread` 是纯函数:按 Codex 开始时间排序轮次,在轮次首个可映射条目处发出 `turn/start`,按代理消息为 DSH step 编号,在第一条用户消息后立即发出 `session/title`,并闭合每个已开启的轮次。事件时间取自 Codex 的 `created_at_ms` 并钳制为单调不减。末尾的 `session/end-seed` 标记导入前缀,后续续接会把整段导入当作种子历史。

### 存储与发布

[`src/index.ts`](src/index.ts) 的扫描先通过 `ctx.sessionPersistence`(create、append、flush、close)写入每份转换日志,再经 `ctx.sessions.create` 以同一组事件发布活跃会话。先落盘意味着活跃发布失败也不会丢数据,落盘日志是重启后的冷数据权威来源。

### 失败隔离

线程级失败记录警告并计入统计,只有扫描中途的取消能停下整轮。整轮扫描为 fire-and-forget,插件卸载时由处置器中止仍在进行的读取循环。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口:配置解析、幂等扫描、落盘 + 活跃发布 |
| [`src/sqlite.ts`](src/sqlite.ts) | 读取 Codex thread-history 存储与标题索引 |
| [`src/convert.ts`](src/convert.ts) | 纯转换:Codex 线程 → DSH 事件,含上限与轮次折叠 |
| [`src/types.ts`](src/types.ts) | 存储边界与转换类型 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Session 分组地图](../README.zh.md) — 分组页面与包表格。
- [会话子系统](../../../docs/subsystems/session.zh.md) — 本包写入的事件日志。
- [会话持久化子系统](../../../docs/subsystems/persistence.zh.md) — 扫描使用的持久化语义。
- [Codex 会话导入 Agent Note](../../../.agents/notes/implemented/feature/2026-09-04-codex-session-import.zh.md) — 导入设计与延后缺口。
- [生成的配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-import-codex) — 每个可接受配置字段及其声明出处。

-----

<a id="model-experience"></a>
## 模型体验

Indirectly, through the imported session logs the agent loop later continues.

#### KV Cache effect

导入的用户、助手与工具消息保存在会话里,直到某个代理续接该会话;该会话的第一个请求会把它们作为普通历史前缀重放,此后模型可见的新增内容全部由 agent loop 与该会话的预设负责。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **仅当前 Codex 存储** — 导入器读取 `thread_history_1.sqlite`;`archived_sessions/` 下的旧版 `*.jsonl` rollout 不导入。
- **一次性快照,非同步** — 已导入的线程被跳过,Codex 之后追加到该线程的条目只有在删除对应 DSH 会话后才会出现。
- **保真度简化** — Codex 的 `reasoning`、`contextCompaction` 与原始文件 diff 不转录;代理消息的 phase 元数据被丢弃,每条代理消息对应一个 DSH step 而非 Codex 原始分组。
- **工具结果有界** — 超出 `maxToolResultChars` 的结果文本被截断,以保持持久日志有界。
- **续接而非迁移** — 导入会话以部署的默认预设与模型续接;Codex 模型只作为助手消息上的 `codex` 来源记录。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文:开放问题与尚未决定的探索方向。它明确不具权威性——已交付的行为、限制与既定理由以上文、包代码和相关 Agent Note 为准。

上面的已知限制列表就是工作队列:旧版 rollout 导入、已导入线程的重同步,以及更深的转录保真度。目前均无设计方案。

</details>
