# Agent Note: Web interactive bottom terminal

Status: implemented

English | [中文](2026-09-07-web-interactive-bottom-terminal.zh.md)

## Problem

The Codex Shell bottom panel used the line-oriented `startSend` path and a `<pre>` plus single-line input UI. That surface is not a Cursor-style terminal: keys do not reach the PTY live, output is not a continuous ANSI stream, and the panel cannot resize the host PTY. The earlier bottom-terminal decision and the persistent-PTY note deferred full-screen / keystroke interaction for the **model** tool surface, which left the Web UI without an interactive path.

## Decision

The Web bottom panel is an **interactive UI surface** beside the existing line-oriented model tools:

- Spawn for the bottom panel uses `interaction: 'interactive'` (`TERM` / PTY name `xterm-256color`, resizable). Model tools keep the default line-oriented spawn (`dumb`, controlled prompt, `startSend` / `read`).
- `ctx.terminals` exposes UI bypass APIs `write`, `resize`, and `followOutput` (raw decoded text with CSI preserved for followers). `startSend` remains exclusive when active; interactive `write` fails loud while a send is active.
- Codex Shell delivers output through a Typert `@Remote({ mode: 'stream' })` `terminalFollow`, plus unary `terminalWrite` / `terminalResize`. The Client renders with `@xterm/xterm` and FitAddon.
- Interactive output is **not** written to the Session log and is **not** fed to the model.

This partially supersedes the “line-oriented only” product stance of [Codex-shell bottom terminal](2026-09-07-codex-shell-bottom-terminal.md) for the Web UI path. [Persistent PTY sessions](2026-07-16-persistent-pty-sessions.md) still defer full-screen TUI guarantees for **model tools**; the UI bypass is best-effort ANSI passthrough without a vim/htop compatibility promise.

## Alternatives considered

**Keep polling `terminalSend` and restyle the panel.** Rejected: Cursor Terminal requires live keys and continuous output; polling cannot provide that contract.

**Replace the model tool surface with interactive bytes.** Rejected: tool readiness, viewport bounds, and sanitizer contracts depend on the line-oriented path.

**Ship xterm against sanitized line buffers only.** Rejected: CSI would be stripped and resize would not reach node-pty.

## Consequences

Bottom panel users get interactive shell input/output and resize. Multi-tab / shell-dialect / Agent-follow workbench behavior is owned by [Bottom terminal tabs](2026-09-07-bottom-terminal-tabs.md). Model `terminal_*` tools are unchanged. Windows ConPTY plus browser xterm may differ on some sequences; acceptance is interactive CLI use and reasonable resize redraw, not full TUI fidelity. High-rate PTY output is batched on the follow stream to protect the Remote mux.
