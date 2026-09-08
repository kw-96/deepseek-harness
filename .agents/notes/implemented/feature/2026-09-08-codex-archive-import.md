# Agent Note: Codex archived rollout import

Status: implemented

English | [中文](2026-09-08-codex-archive-import.zh.md)

## Problem

Codex keeps older conversations under `archived_sessions/*.jsonl`. The current importer read only `thread_history_1.sqlite`, so archived-only sessions never appeared in DSH even when their rollout contained messages, tools, working-directory metadata, and completed turns.

## Decision

The importer reads legacy archived rollout files, normalizes `session_meta`, `turn_context`, `event_msg`, and `response_item` records into the same `CodexThreadRecord` consumed by the current converter, and then uses the same title, cwd, snapshot reconciliation, and workspace rules as current threads. Archived files deduplicate by `session_id`, retaining the latest rollout. When a current SQLite thread shares that id, the current thread wins and the archive copy is skipped.

## Alternatives considered

**Import archive files as opaque transcript attachments.** Rejected because they carry enough message, tool, turn, and cwd data to join the standard DSH session projection.

**Import both current and archived copies under different DSH ids.** Rejected because one Codex conversation would appear twice and its workspace ownership could diverge.

## Consequences

Archived-only Codex conversations become normal DSH sessions. Legacy rollout item types without a current mapping remain omitted from the transcript, while current SQLite threads continue to provide the authoritative version when both sources exist.
