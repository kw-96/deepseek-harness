# Agent Note: Web 交互式底栏终端

Status: implemented

[English](2026-09-07-web-interactive-bottom-terminal.md) | 中文

## 问题

Codex Shell 底栏走的是行模式 `startSend`，UI 是 `<pre>` 加单行输入。它不是 Cursor 式终端：按键不能实时进 PTY，输出不是持续 ANSI 流，面板也无法 resize Host PTY。更早的底栏决策与持久 PTY Note 把全屏 / 按键交互推迟给了**模型**工具面，Web UI 因此没有交互路径。

## 决策

Web 底栏是与现有行模式模型工具**并行**的 **交互 UI 面**：

- 底栏 spawn 使用 `interaction: 'interactive'`（`TERM` / PTY name 为 `xterm-256color`，可 resize）。模型工具保持默认行模式 spawn（`dumb`、受控 prompt、`startSend` / `read`）。
- `ctx.terminals` 暴露 UI 旁路 API：`write`、`resize`、`followOutput`（为订阅者保留含 CSI 的解码文本）。`startSend` 活跃时仍独占；此时交互 `write` 失败大声。
- Codex Shell 用 Typert `@Remote({ mode: 'stream' })` 的 `terminalFollow` 推送输出，另加 unary `terminalWrite` / `terminalResize`。Client 用 `@xterm/xterm` 与 FitAddon 渲染。
- 交互输出**不**写入 Session log，也**不**喂给模型。

对 Web UI 路径，这部分取代 [Codex-shell 底栏终端](2026-09-07-codex-shell-bottom-terminal.zh.md) 的「仅行模式」产品口径。[持久 PTY 会话](2026-07-16-persistent-pty-sessions.zh.md) 对**模型工具**仍推迟全屏 TUI 保证；UI 旁路是尽力 ANSI 透传，不承诺 vim/htop 级兼容。

## 曾考虑的替代方案

**继续轮询 `terminalSend`，只改样式。** 不采用：Cursor Terminal 需要实时按键与持续输出，轮询无法提供该约定。

**用交互字节流替换模型工具面。** 不采用：工具就绪、viewport 边界与 sanitizer 依赖行模式路径。

**只对消毒后的行缓冲接 xterm。** 不采用：CSI 会被剥掉，且 resize 到不了 node-pty。

## 后果

底栏用户获得交互式 shell 输入/输出与 resize。模型 `terminal_*` 工具不变。Windows ConPTY 与浏览器 xterm 在部分序列上仍可能有差异；验收标准是交互 CLI 与合理的 resize 重绘，而非完整 TUI 保真。高频 PTY 输出在 follow 流上批处理，以免打爆 Remote mux。
