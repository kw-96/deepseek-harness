# Agent Note: Codex archived rollout import

Status: implemented

English | [中文](2026-09-08-codex-archive-import.zh.md)

## Problem

Codex keeps older conversations under `archived_sessions/*.jsonl`. The current importer read only `thread_history_1.sqlite`, so archived-only sessions never appeared in DSH even when their rollout contained messages, tools, working-directory metadata, and completed turns.

## Decision

The importer reads Codex's authoritative thread index from `state_5.sqlite` (`threads.rollout_path`, `threads.cwd`, `threads.name`, `threads.archived`). For each indexed thread it reads that rollout file, normalizing `session_meta`, `turn_context`, `event_msg`, and `response_item` records into the same `CodexThreadRecord` consumed by the current converter. Index entries also cover threads the current SQLite store or the legacy archive directory miss. Thread-level cwd and curated name override derived values, so DSH workspace grouping mirrors Codex's project view and archived threads keep their curated titles. When the current SQLite thread and an archived rollout share a session id, the current thread wins and the archive copy is skipped.

## Alternatives considered

**Import archive files as opaque transcript attachments.** Rejected because they carry enough message, tool, turn, and cwd data to join the standard DSH session projection.

**Import both current and archived copies under different DSH ids.** Rejected because one Codex conversation would appear twice and its workspace ownership could diverge.

## Consequences

Archived-only and index-only Codex conversations become normal DSH sessions under Codex's thread-level project directories. Legacy rollout item types without a current mapping remain omitted from the transcript, while current SQLite threads continue to provide the authoritative event content when both sources exist.
