# Agent Note: Codex session import into DSH sessions

Status: implemented

English | [中文](2026-09-04-codex-session-import.zh.md)

## Problem

Users who run Codex locally keep their conversation history in Codex's thread store, and the harness has no way to show those conversations. The Web session list reads DSH sessions from the session-query provider, which reconciles durable session logs with the live store; a Codex thread must therefore become a standard DSH session — a valid event log plus a storage header — before any list or transcript surface can show it.

## Decision

`@deepseek-ai/dsh-session-import-codex` mounts a boot-time, idempotent import sweep. It reads Codex's `thread_history_1.sqlite` (`thread_items` and `thread_turns`) read-only through `node:sqlite` and joins the optional `session_index.jsonl` titles. Each thread converts into contiguous DSH events — `user/message`, `assistant/message`, `tool/call`/`tool/result` pairs, `turn/start`/`turn/end`, `session/title`, and a trailing `session/end-seed` — with Codex timestamps and caps on tool-result and title text. Every thread maps to one fixed session id, `codex-<threadId>`, and the sweep skips a thread whose session already exists live or stored.

Each converted log is written through `ctx.sessionPersistence` (create, append, flush, close) before `ctx.sessions.create` publishes the same events as a live session. Storage-first means a failed live publication loses nothing and the stored log is the cold source of truth after restart; live publication makes the sidebar list update immediately through the existing `session/created` → `api-session/added` path. The import records a header `cwd` (most common command cwd in the thread, else the configured fallback) because the cold list path skips sessions without one.

The sweep is fire-and-forget with a disposer that aborts the read loop; per-thread failures are logged and counted and never stop the sweep.

## Alternatives considered

**Sync on a timer or file watcher.** Rejected: a Codex store is a single machine's history, not a service to mirror continuously; the idempotent boot sweep imports new threads on every restart, and later activity in an already-imported thread is out of scope for a snapshot importer.

**Import legacy `archived_sessions/*.jsonl` rollouts too.** Rejected for the first version: the archived format is a different line protocol (`session_meta`/`event_msg`/`response_item`) with its own message vocabulary, and the current store covers the threads users actively work with. It is recorded as deferred work.

**Publish live only.** Rejected: sessions created by a plugin have no agent-loop writer attached, so they would not survive a process restart; the storage write must be the importer's own transaction.

**Record Codex model settings as a `request/header`.** Rejected: the rollout records no reliably complete provider config, and a fabricated header would make resume replay history under the wrong assumptions; continuation uses the deployment's default preset and model instead.

## Consequences

Codex history appears in the Web session list without any per-thread action, is idempotent across restarts, and stays bounded by the configurable caps. New deferred gaps are owned by the package README: legacy rollout import, resync of already-imported threads, and deeper fidelity (reasoning, file diffs, phase metadata). The importer injects `sessions` and `sessionPersistence`, so a deployment without persistence never runs a partial import; the absence of a Codex store is a normal state, logged and skipped.
