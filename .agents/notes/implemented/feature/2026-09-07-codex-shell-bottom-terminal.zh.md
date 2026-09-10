# Agent Note: Codex-shell 底部终端

Status: implemented

[English](2026-09-07-codex-shell-bottom-terminal.md) | 中文

## 问题

右侧命令面板只展示既有用户指令，不能提供独立终端界面、持久 shell 状态或可滚动的命令输出。

## 决策

Web AppFrame 提供带可调高度且受会话约束的 `bottom` 槽位。Codex Shell 在其中挂载底部终端，并通过类型化 Remote 打开 Host 所有的 PTY。终端归当前 live Agent 所有，在选中会话 cwd 中启动 Windows pwsh backend，并且只为该 Agent 的终端 id 提供输出读取、命令发送和关闭操作。

## 备选方案

**将命令历史卡片移动到底部。** 不予采用，因为提示词历史不是终端，无法保留 shell cwd、环境或交互进程状态。

**通过 Git Remote 从浏览器执行任意 shell 命令。** 不予采用，因为这会绕过终端注册表的所有权隔离、沙箱策略、有界滚动缓冲和进程清理。

## 影响

底部面板独立于右侧 details 列，可从会话头打开。没有 live Agent 的会话不能打开 PTY，会显示 Host 诊断而不是伪造终端。Web UI 路径由[交互式底栏终端](2026-09-07-web-interactive-bottom-terminal.zh.md)（xterm + 实时 PTY write/follow/resize）取代。模型工具仍走行模式 backend；全屏 TUI 兼容仍不在该工具约定内。
