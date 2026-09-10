# Agent Note: Bottom terminal tabs

Status: implemented

English | [中文](2026-09-07-bottom-terminal-tabs.zh.md)

## Problem

The interactive Web bottom terminal was a single fixed PTY (`codex-bottom`). Users could not open parallel shells, pick `pwsh` vs `bash` per tab, or follow model `terminal_*` sessions in the same panel the way Cursor's terminal workbench does.

## Decision

Codex Shell bottom panel is a multi-tab workbench on top of the interactive PTY bypass from [Web interactive bottom terminal](2026-09-07-web-interactive-bottom-terminal.md):

- UI tabs spawn with `interaction: 'interactive'`, unique `ui-<dialect>-N` names, and optional per-session `shellDialect` (`bash` | `pwsh`). Windows clients default new tabs to `pwsh`; others to `bash`.
- `terminalOpen` accepts options (`cwd`, `name`, `shellDialect`, size). `terminalList` returns owner-scoped sessions with `origin: 'ui' | 'agent'` (`ui-` name prefix marks UI).
- Agent tool sessions appear as follow-only tabs. Closing an Agent tab dismisses it from the UI without `kill`. Closing a UI tab calls `terminalClose` / kill.
- `cmd.exe` is out of scope while `ShellDialect` remains `bash | pwsh`.

## Alternatives considered

**Keep one shared `codex-bottom` PTY and only restyle tabs.** Rejected: tabs would not isolate cwd/output or shell dialect.

**Kill Agent PTYs when the user closes the tab.** Rejected: the model may still own that session for tools.

**Add `cmd.exe` as a third dialect in the same change.** Deferred: dialect and backend contracts today only cover bash and pwsh.

## Consequences

Bottom panel users can open multiple interactive shells, switch dialects from the `+` menu, and attach to live Agent terminals. Inactive tabs stay mounted and keep following PTY output. Split panes and full TUI fidelity remain outside this surface. Ship path: `dsh-codex-shell` **0.6.3** with local `dsh-terminal` / `dsh-terminal-bash` **0.1.2-rc.2** tarballs (per-session `shellDialect`).
