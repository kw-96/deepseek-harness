# Agent Note: Codex session import into DSH sessions

Status: implemented

English | [中文](2026-09-04-codex-session-import.zh.md)

## Problem

Users who run Codex locally keep their conversation history in Codex's thread store, and the harness has no way to show those conversations. The Web session list reads DSH sessions from the session-query provider, which reconciles durable session logs with the live store; a Codex thread must therefore become a standard DSH session — a valid event log plus a storage header — before any list or transcript surface can show it.

## Decision

`@deepseek-ai/dsh-session-import-codex` exposes manual import by default. Its `autoSync` setting defaults to `false`; enabling it runs one import immediately and enables the configured periodic sweep. It reads Codex's `thread_history_1.sqlite` (`thread_items` and `thread_turns`) read-only through `node:sqlite` and joins the optional `session_index.jsonl` titles. Each thread converts into contiguous DSH events — `user/message`, `assistant/message`, `tool/call`/`tool/result` pairs, `turn/start`/`turn/end`, `session/title`, and a trailing `session/end-seed` — with Codex timestamps and caps on tool-result and title text. Every thread maps to one fixed session id, `codex-<threadId>`.

Each converted log is written through `ctx.sessionPersistence` before `ctx.sessions.replace` publishes its seed events as a live session. Storage-first means a failed live publication loses nothing and the stored log is the cold source of truth after restart; live publication makes the sidebar list update immediately through the existing `session/created` → `api-session/added` path. The import records a header `cwd` from the latest absolute command or MCP cwd, else the configured fallback, because the cold list path skips sessions without one. A missing `session_index.jsonl` title falls back to the first user message, so valid threads outside that index do not become hidden blank sessions. Repeated runs compare the converted events and header with the stored snapshot: unchanged sessions only reconcile membership, changed cold or importer-owned live sessions replace their durable snapshot and move to the matching canonical Workspace, and Agent-owned sessions defer to a later sweep. The JSONL provider journals a cross-cwd replacement so startup recovers an interrupted rehome.

The sweep is fire-and-forget with a disposer that aborts the read loop; per-thread failures are logged and counted and never stop the sweep.

## Alternatives considered

**Enable an import sweep at every host start.** Rejected: opening the Web profile must not create user-visible sessions without an explicit import choice. The settings toggle retains optional immediate and periodic import.

**Sync on a file watcher.** Rejected: the settings-controlled sweep already gives bounded, explicit reconciliation; a watcher would add store-churn lifecycle without improving the source-of-truth rule.

**Import legacy `archived_sessions/*.jsonl` rollouts too.** Rejected for the first version: the archived format is a different line protocol (`session_meta`/`event_msg`/`response_item`) with its own message vocabulary, and the current store covers the threads users actively work with. It is recorded as deferred work.

**Publish live only.** Rejected: sessions created by a plugin have no agent-loop writer attached, so they would not survive a process restart; the storage write must be the importer's own transaction.

**Record Codex model settings as a `request/header`.** Rejected: the rollout records no reliably complete provider config, and a fabricated header would make resume replay history under the wrong assumptions; continuation uses the deployment's default preset and model instead.

## Consequences

Codex history appears after a manual import or explicit automatic-sync choice, stays bounded by the configurable caps, and reconciles existing thread content, title fallback, and workspace ownership on later sweeps. New deferred gaps are owned by the package README: legacy rollout import and deeper fidelity (reasoning, file diffs, phase metadata). The importer injects `sessions`, `sessionPersistence`, and `workspaceRegistry`, so a deployment without persistence or workspace ownership never runs a partial import; the absence of a Codex store is a normal state, logged and skipped. [Codex import reconciliation](../bug-fix/2026-09-07-codex-import-reconciliation.md) owns the replacement safety rules.
