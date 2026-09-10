# Agent Note: 底栏多 Tab 终端

Status: implemented

[English](2026-09-07-bottom-terminal-tabs.md) | 中文

## Problem

交互式 Web 底栏终端原先只绑定单一固定 PTY（`codex-bottom`）。用户无法并行开多个 shell、按 tab 选择 `pwsh`/`bash`，也无法像 Cursor 工作台那样在同一面板跟随模型 `terminal_*` 会话。

## Decision

Codex Shell 底栏在 [Web 交互式底栏终端](2026-09-07-web-interactive-bottom-terminal.zh.md) 的交互旁路之上，做成多 tab 工作台：

- UI tab 使用 `interaction: 'interactive'`、唯一名 `ui-<dialect>-N`，以及可选的 per-session `shellDialect`（`bash` | `pwsh`）。Windows 默认新建 `pwsh`，其他平台默认 `bash`。
- `terminalOpen` 接受 options（`cwd`、`name`、`shellDialect`、尺寸）。`terminalList` 返回 owner 作用域会话，并用 `origin: 'ui' | 'agent'`（`ui-` 前缀标 UI）。
- Agent 工具会话以可跟随 tab 出现。关闭 Agent tab 只从 UI 卸下，不 `kill`；关闭 UI tab 则 `terminalClose` / kill。
- 在 `ShellDialect` 仍为 `bash | pwsh` 期间，`cmd.exe` 不在范围。

## Alternatives considered

**保留单一 `codex-bottom`，只把 UI 做成假 tab。** 否决：无法隔离 cwd/输出或方言。

**关闭 Agent tab 时一并 kill PTY。** 否决：模型工具可能仍持有该会话。

**同变更加入 `cmd.exe` 第三方言。** 推迟：当前方言与后端契约只覆盖 bash 与 pwsh。

## Consequences

底栏可开多个交互 shell、用 `+` 菜单选方言，并挂载 live Agent 终端。非活跃 tab 保持挂载并继续 follow PTY 输出。分屏与完整 TUI 保真仍不在本表面。发布路径：`dsh-codex-shell` **0.6.3**，并附本地 `dsh-terminal` / `dsh-terminal-bash` **0.1.2-rc.2** tarball（per-session `shellDialect`）。
