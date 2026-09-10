# Agent Note: Codex-shell bottom terminal

Status: implemented

English | [中文](2026-09-07-codex-shell-bottom-terminal.zh.md)

## Problem

The right-side command panel only showed prior user prompts. It did not provide an independent terminal surface, persistent shell state, or scrollable command output.

## Decision

The Web AppFrame owns a session-scoped `bottom` slot with a resizable height. Codex Shell mounts a bottom terminal there and opens the host-owned PTY through its typed Remote. The terminal is owned by the current live Agent, starts the Windows pwsh backend in the selected session cwd, and exposes output read, command send, and close operations only for that Agent's terminal id.

## Alternatives considered

**Move the command-history card to the bottom.** Rejected because prompt history is not a terminal and cannot retain shell cwd, environment, or interactive process state.

**Run arbitrary browser-side shell commands through the Git Remote.** Rejected because it would bypass the terminal registry's owner isolation, sandbox policy, bounded scrollback, and process cleanup.

## Consequences

The bottom panel is independent of the right details column and can be opened from the session header. A session without a live Agent cannot open a PTY and receives the Host diagnostic instead of a synthetic terminal. The Web UI path is superseded by the [interactive bottom terminal](2026-09-07-web-interactive-bottom-terminal.md) (xterm + live PTY write/follow/resize). Model tools remain on the line-oriented backend; full-screen TUI compatibility is still outside that tool contract.
