# Agent Note: Codex import reconciliation

Status: implemented

English | [中文](2026-09-07-codex-import-reconciliation.zh.md)

## Problem

Codex imports read every thread from `thread_history_1.sqlite`, but a fixed DSH id was treated as final. Later Codex items, a changed current cwd, and threads omitted from `session_index.jsonl` were not reconciled. The last case yielded imported logs without a title, which normal DSH workspace projections can hide as blank sessions.

## Decision

Every sweep converts every non-empty Codex thread and compares its complete event log plus header with the stored `codex-<threadId>` snapshot. A missing index title falls back to the first user message. The latest absolute command or MCP cwd is the header cwd. Unchanged snapshots only repair workspace membership. Changed snapshots replace their durable JSONL artifact and replace the non-Agent live session; all prior workspace accounts detach the id before the target workspace attaches it. An Agent-owned session is deferred and reported for the next sweep.

`SessionPersistence.replace` is an explicit opt-in capability: unsupported providers reject loudly. JSONL implements it with a persisted replacement journal, so a cross-cwd rehome either restores the old artifact or finishes cleanup before discovery resumes.

## Alternatives considered

**Keep existing sessions immutable and only attach another workspace.** Rejected because workspace membership validates the immutable header cwd, so it cannot represent a changed Codex project.

**Create a new DSH id for every changed Codex thread.** Rejected because it duplicates history, breaks stable session links, and leaves stale workspace entries.

**Rewrite a JSONL file in place without recovery state.** Rejected because a cross-directory cwd move can lose the discoverable artifact on interruption.

## Consequences

Current Codex threads retain one DSH id while their transcript and project ownership converge on later imports. After a user enables automatic sync, the default 60-second sweep applies the same reconciliation; `syncIntervalMs: 0` explicitly disables repetition. The settings card separates new imports, updates, unchanged sessions, and active-session deferrals. Legacy `archived_sessions` import and deeper transcript fidelity remain separate package limits.
