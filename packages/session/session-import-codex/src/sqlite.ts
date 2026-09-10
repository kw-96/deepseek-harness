/**
 * Read Codex's thread-history store: the `thread_history_1.sqlite` tables
 * plus the optional `session_index.jsonl` title index. Produces assembled
 * {@link CodexThreadRecord}s for the converter. `node:sqlite` opens the store
 * read-only, so Codex can keep writing while an import sweep reads it.
 * @module @deepseek-ai/dsh-session-import-codex/sqlite
 */

import { readFile } from 'node:fs/promises'
import type { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import type {
  CodexThreadItem,
  CodexThreadRecord,
  CodexThreadTurn,
} from './types.ts'

/** Fixed table name Codex writes into its thread-history database. */
const THREAD_HISTORY_FILE = 'thread_history_1.sqlite'

/** Fixed index file name carrying `{ id, thread_name, updated_at }` rows. */
const SESSION_INDEX_FILE = 'session_index.jsonl'

/** One raw item row as stored in `thread_items`. */
interface ThreadItemRow {
  readonly thread_id: string
  readonly turn_id: string
  readonly item_id: string
  readonly rollout_ordinal: number
  readonly created_at_ms: number
  readonly item_type: string
  readonly item_json: string
}

/** One raw turn row as stored in `thread_turns`. */
interface ThreadTurnRow {
  readonly thread_id: string
  readonly turn_id: string
  readonly started_at: number | null
  readonly completed_at: number | null
  readonly status: string
}

/** Narrow a parsed JSON item to a plain record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Convert Codex's seconds-since-epoch turn stamps into Unix epoch milliseconds. */
function toMillis(seconds: number | null): number | undefined {
  if (seconds === null || !Number.isSafeInteger(seconds)) return undefined
  return seconds * 1000
}

/** Read one JSONL index file into parsed line objects, or empty when absent. */
async function readIndexLines(codexHome: string): Promise<Record<string, unknown>[]> {
  const lines: Record<string, unknown>[] = []
  let text: string
  try {
    text = await readFile(join(codexHome, SESSION_INDEX_FILE), 'utf8')
  } catch {
    return lines
  }
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    try {
      const record = asRecord(JSON.parse(line))
      if (record !== undefined) lines.push(record)
    } catch {
      // A torn or foreign line must not abort the whole sweep.
    }
  }
  return lines
}

/**
 * Read every Codex thread from `codexHome`'s thread-history database.
 * @param codexHome - Codex home directory (the `~/.codex` equivalent).
 * @returns assembled thread records in first-seen order, or `undefined` when
 *   the database file does not exist (Codex was never run here).
 */
export async function loadCodexThreads(codexHome: string): Promise<CodexThreadRecord[] | undefined> {
  const { DatabaseSync } = await import('node:sqlite')
  let db: DatabaseSync
  try {
    db = new DatabaseSync(join(codexHome, THREAD_HISTORY_FILE), { readOnly: true })
  } catch {
    return undefined
  }
  try {
    const indexLines = await readIndexLines(codexHome)
    const titles = new Map<string, string>()
    for (const line of indexLines) {
      const id = typeof line['id'] === 'string' ? line['id'] : undefined
      const name = typeof line['thread_name'] === 'string' ? line['thread_name'] : undefined
      if (id !== undefined && name !== undefined && name.length > 0) titles.set(id, name)
    }

    const itemRows = db.prepare(
      'SELECT thread_id, turn_id, item_id, rollout_ordinal, created_at_ms, item_type, item_json '
      + 'FROM thread_items ORDER BY thread_id, rollout_ordinal, created_at_ms',
    ).all() as unknown as ThreadItemRow[]
    const turnRows = db.prepare(
      'SELECT thread_id, turn_id, started_at, completed_at, status FROM thread_turns',
    ).all() as unknown as ThreadTurnRow[]

    const itemsByThread = new Map<string, CodexThreadItem[]>()
    for (const row of itemRows) {
      let json: Record<string, unknown> | undefined
      try {
        json = asRecord(JSON.parse(row.item_json))
      } catch {
        continue
      }
      if (json === undefined || row.item_id.length === 0) continue
      const item: CodexThreadItem = {
        turnId: row.turn_id,
        itemId: row.item_id,
        itemType: row.item_type,
        createdAtMs: row.created_at_ms,
        json,
      }
      const existing = itemsByThread.get(row.thread_id)
      if (existing === undefined) itemsByThread.set(row.thread_id, [item])
      else existing.push(item)
    }

    const turnsByThread = new Map<string, CodexThreadTurn[]>()
    for (const row of turnRows) {
      const startedAtMs = toMillis(row.started_at)
      const completedAtMs = toMillis(row.completed_at)
      const turn: CodexThreadTurn = {
        turnId: row.turn_id,
        ...startedAtMs === undefined ? {} : { startedAtMs },
        ...completedAtMs === undefined ? {} : { completedAtMs },
        status: row.status,
      }
      const existing = turnsByThread.get(row.thread_id)
      if (existing === undefined) turnsByThread.set(row.thread_id, [turn])
      else existing.push(turn)
    }

    const records: CodexThreadRecord[] = []
    for (const [threadId, items] of itemsByThread) {
      const turns = turnsByThread.get(threadId) ?? []
      const title = titles.get(threadId)
      records.push({ threadId, ...title === undefined ? {} : { title }, items, turns })
    }
    return records
  } finally {
    db.close()
  }
}
