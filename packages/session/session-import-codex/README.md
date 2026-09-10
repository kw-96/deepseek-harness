---
description: "Import local Codex threads into DeepSeek Harness sessions — Codex messages, tool calls, titles, and turn boundaries become DSH sessions that appear in the Web session list — for Codex users and maintainers of the importer."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-import-codex

English | [中文](README.zh.md)

## Summary

`dsh-session-import-codex` imports current Codex threads and archived rollout sessions from your local Codex install into DeepSeek Harness sessions when you choose **Import now**. It converts each source into a standard DSH event log, stores it durably, publishes it live, and reconciles its Workspace membership against the source working directory. The current SQLite thread wins when it shares an id with an archived rollout, so one Codex session never produces a duplicate DSH session. Automatic import is off by default; enabling the settings-card toggle runs one reconciliation and then uses the configured interval. The importer reads Codex only and never writes back to it.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package with session persistence and `dsh-workspace` already composed (it injects `sessions`, `sessionPersistence`, and `workspaceRegistry`). Use the settings card's **Import now** button to start an import; automatic import is opt-in.

### Smallest working setup

```yaml
- name: '@deepseek-ai/dsh-session-import-codex'
```

| Field | Default | Meaning |
|---|---|---|
| `codexHome` | `CODEX_HOME`, then `~/.codex` | Directory containing `thread_history_1.sqlite`, `session_index.jsonl`, and optional `archived_sessions/*.jsonl` |
| `cwd` | process cwd | Absolute working directory recorded on imported headers when a thread carries no command cwd |
| `maxToolResultChars` | `20,000` | Maximum UTF-16 code units of imported tool-result text |
| `maxTitleChars` | `300` | Maximum UTF-16 code units of an imported session title |
| `syncIntervalMs` | `60,000` | Periodic re-scan interval while the card's sync toggle is on; `0` disables it |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-session-import-codex) is the exhaustive source for every accepted field.

### How the import behaves

- Automatic import is disabled by default. Enabling `autoSync` runs one sweep immediately and then repeats it at `syncIntervalMs`; **Import now** always runs one sweep.
- Each imported session keeps a fixed id: `codex-` plus the Codex thread id. Re-runs compare its complete converted snapshot, replace changed imported logs, and reconcile exactly one matching Workspace membership. A session owned by a live Agent is deferred until a later sweep.
- The session title comes from Codex's curated thread name in `state_5.sqlite`, otherwise `session_index.jsonl`, otherwise the first user message. The session `cwd` comes from Codex's thread-level working directory in `state_5.sqlite` (the configured `cwd` otherwise), so DSH workspace grouping mirrors Codex's project view.
- Imported sessions are stored durably and published live, then attached to a Workspace with the same canonical `cwd`, so they appear under the matching working directory in the Web session list and remain listed after restart.
- A thread whose store or conversion fails is skipped with a warning; one broken thread never stops the sweep.
- With no Codex thread store, the plugin logs that there is nothing to import and loads normally.

### Settings card and Remote

The plugin serves a `codex-import` settings namespace (one field, `autoSync`, default `false`) and a `codexImport` Remote namespace with `run()` and `history()`. The companion client package `@deepseek-ai/dsh-client-ui-codex-import` renders a card in the Web **Plugins** configuration tab from that namespace: a sync toggle, a manual import button, and durable import history in a height-bounded, internally scrolling column whose runs fold to reveal per-session open buttons. The toggle gates both the immediate automatic sweep and periodic re-scans (`syncIntervalMs`); the manual button always runs.

### Item mapping

| Codex item | DSH events |
|---|---|
| `userMessage` | `user/message` with its text blocks |
| `agentMessage` | `assistant/message` (one DSH step per agent message) |
| `commandExecution` | `tool/call` + `tool/result` as `Bash`, arguments `{ command, cwd }` |
| `mcpToolCall` | `tool/call` + `tool/result` as `mcp.<server>.<tool>` |
| `webSearch` | `tool/call` + `tool/result` as `web_search`, arguments `{ query }` |
| `fileChange` | `tool/call` + `tool/result` as `codex.fileChange`, arguments `{ paths, kinds }` |
| `imageView` | `tool/call` + `tool/result` as `codex.imageView`, arguments `{ path }` |
| `reasoning`, `contextCompaction`, unknown | skipped — not transcript material |

Completed Codex turns close as `completed`; every other turn closes as `aborted` with the `legacy` cause, matching the imported-history vocabulary. Each tool item also emits the assistant message that requested it, carrying that item's own call id, name, and arguments, in the same step as its result, so the imported transcript declares every tool call it answers — the pairing every provider requires.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Read path

`loadCodexThreads` in [`src/sqlite.ts`](src/sqlite.ts) opens `thread_history_1.sqlite` read-only through `node:sqlite`, reads the `thread_items` and `thread_turns` tables, and joins the optional `session_index.jsonl` titles. A missing database returns `undefined` — a machine that never ran Codex is not an error.

### Conversion

`convertCodexThread` in [`src/convert.ts`](src/convert.ts) is pure: it orders turn groups by Codex start time, emits `turn/start` on the first mapped item of a turn, numbers DSH steps per agent message, emits the `session/title` event right after the first user message, and closes every opened turn. Event times come from Codex's `created_at_ms`, clamped to stay monotonic. The final `session/end-seed` marks the imported prefix, so a later resume treats the whole import as seed history.

### Storage and publication

The sweep in [`src/index.ts`](src/index.ts) creates new logs through `ctx.sessionPersistence` and replaces changed imported snapshots through its guarded replacement method before publishing the same events through `ctx.sessions.replace`. The JSONL provider journals a cross-cwd replacement so startup can recover an interrupted move. Storage first means a failed live publication never loses data, and the stored log is the cold source of truth after restart.

### Failure containment

Per-thread failures are logged and counted; only an abort of the sweep between threads stops it. The whole sweep is fire-and-forget with a disposer that aborts the in-flight read loop when the plugin unloads.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config resolution, idempotent sweep, storage + live publication |
| [`src/sqlite.ts`](src/sqlite.ts) | Reads the Codex thread-history store and title index |
| [`src/convert.ts`](src/convert.ts) | Pure Codex-thread → DSH-event conversion with caps and turn folding |
| [`src/types.ts`](src/types.ts) | Storage-boundary and conversion types |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Session group map](../README.md) — the group page and its package table.
- [Session subsystem](../../../docs/subsystems/session.md) — the event log this package writes.
- [Session persistence subsystem](../../../docs/subsystems/persistence.md) — the durable storage semantics the sweep uses.
- [Codex session import Agent Note](../../../.agents/notes/implemented/feature/2026-09-04-codex-session-import.md) — the import design and its deferred gaps.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-session-import-codex) — every accepted config field and its source declaration.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the imported session logs the agent loop later continues.

#### KV Cache effect

Imported user, assistant, and tool messages sit in the stored session until an agent continues it; the first request on that session replays them as the ordinary history prefix, after which the agent loop and the session's preset own every model-visible addition.

## Known Limitations and Deferred Work

- **Current-thread precedence** — when a current SQLite thread and archived rollout share a Codex session id, the current thread is imported and the archived copy is skipped.
- **Active-session deferral** — an imported session currently owned by a live Agent is not replaced during a sweep; the settings card reports it as deferred and a later sweep reconciles it.
- **Simplified fidelity** — Codex `reasoning`, `contextCompaction`, and raw file diffs are not transcribed; agent-message phase metadata is dropped, and each agent message becomes one DSH step rather than Codex's original grouping.
- **Synthesized tool-call messages** — because Codex records a call and its output in one item, each tool item yields one additional assistant message holding only that item's call id, name, and arguments; the message carries no text of its own.
- **Bounded tool results** — result text beyond `maxToolResultChars` is truncated to keep the durable log bounded.
- **Continuation, not migration** — imported sessions resume with the deployment's default preset and model; the Codex model is recorded only as `codex` provenance on the assistant messages.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

The Known Limitations list above is the working queue: deeper archived-rollout fidelity and broader legacy item coverage. [Codex archive import](../../../.agents/notes/implemented/feature/2026-09-08-codex-archive-import.md) owns the source-priority rule, and [Codex import reconciliation](../../../.agents/notes/implemented/bug-fix/2026-09-07-codex-import-reconciliation.md) owns current-snapshot replacement.

</details>
