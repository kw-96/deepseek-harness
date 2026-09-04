/**
 * Types for reading Codex thread storage and converting it into DSH sessions.
 * Only storage-boundary and conversion inputs live here; DSH event types come
 * from `@deepseek-ai/dsh-session`.
 * @module @deepseek-ai/dsh-session-import-codex/types
 */

import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'

/** One item (message, tool call, or record) inside a Codex thread. */
export interface CodexThreadItem {
  /** Codex turn id the item belongs to; may be empty for orphaned items. */
  readonly turnId: string
  /** Stable Codex item id, reused as the DSH message or tool-call id. */
  readonly itemId: string
  /** Discriminating Codex item vocabulary entry (`userMessage`, `commandExecution`, …). */
  readonly itemType: string
  /** Unix epoch milliseconds when Codex recorded the item. */
  readonly createdAtMs: number
  /** Parsed `item_json` row content, in Codex's own shape. */
  readonly json: Record<string, unknown>
}

/** One Codex turn boundary, read from the `thread_turns` table. */
export interface CodexThreadTurn {
  /** Codex turn id matching `CodexThreadItem.turnId`. */
  readonly turnId: string
  /** Unix epoch milliseconds, derived from the stored seconds value; absent when Codex recorded none. */
  readonly startedAtMs?: number
  /** Unix epoch milliseconds, derived from the stored seconds value; absent when Codex recorded none. */
  readonly completedAtMs?: number
  /** Codex turn status (`completed` or another verbatim state). */
  readonly status: string
}

/** One Codex thread assembled from the thread-history store plus its optional index title. */
export interface CodexThreadRecord {
  /** Codex thread id; the imported DSH session id is `codex-<threadId>`. */
  readonly threadId: string
  /** Human title from `session_index.jsonl` when Codex recorded one. */
  readonly title?: string
  /** Items in rollout order. */
  readonly items: readonly CodexThreadItem[]
  /** Turn boundaries for this thread, in start order. */
  readonly turns: readonly CodexThreadTurn[]
}

/** Conversion caps applied while building DSH events from Codex records. */
export interface ImportBounds {
  /** Maximum UTF-16 code units of any imported tool-result text. */
  readonly maxToolResultChars: number
  /** Maximum UTF-16 code units of an imported session title. */
  readonly maxTitleChars: number
}

/** The outcome of converting one Codex thread. */
export interface ConvertedCodexThread {
  /** Contiguous DSH events from seq 0, ending with `session/end-seed`. */
  readonly events: SessionEvent[]
  /** Absolute working directory recorded on the DSH session header. */
  readonly cwd: string
}

/** The outcome of one import sweep. */
export interface CodexImportSummary {
  /** Threads written into DSH storage this sweep. */
  readonly imported: number
  /** Threads skipped because a DSH session with that id already exists. */
  readonly skippedExisting: number
  /** Threads skipped because they convert to no DSH events. */
  readonly skippedEmpty: number
}

/** One imported session as reported to the card (id and display title). */
export interface CodexImportSession {
  /** DSH session id (`codex-<threadId>`). */
  readonly id: SessionId
  /** Codex thread title, or the empty string when Codex recorded none. */
  readonly title: string
}

/** The full sweep outcome: counts plus the sessions it newly imported. */
export interface CodexImportSweepResult {
  readonly summary: CodexImportSummary
  readonly sessions: readonly CodexImportSession[]
}

/** One recorded import run returned by the Remote `run`/`history` methods. */
export interface CodexImportRun {
  /** Unix epoch milliseconds when the run finished. */
  readonly at: number
  /** Threads newly imported by this run. */
  readonly imported: number
  /** Threads skipped because their session already existed. */
  readonly skippedExisting: number
  /** Threads skipped because they converted to no events. */
  readonly skippedEmpty: number
  /** The sessions this run imported. */
  readonly sessions: readonly CodexImportSession[]
}

/** The Remote `history` result: recorded runs, newest first. */
export interface CodexImportHistoryValue {
  readonly runs: readonly CodexImportRun[]
}
