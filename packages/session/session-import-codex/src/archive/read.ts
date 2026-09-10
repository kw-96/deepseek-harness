/** Read legacy Codex archived rollout JSONL files into current thread records. */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { CodexThreadItem, CodexThreadRecord, CodexThreadTurn } from '../types.ts'

const ARCHIVE_DIR = 'archived_sessions'

interface ArchivedRow {
  readonly timestamp?: unknown
  readonly ordinal?: unknown
  readonly type?: unknown
  readonly payload?: unknown
}

/**
 * Read the latest archived rollout for each Codex session id.
 * @param codexHome Codex home containing `archived_sessions`.
 * @returns normalized records; a missing archive directory is empty.
 */
export async function loadCodexArchivedThreads(codexHome: string): Promise<CodexThreadRecord[]> {
  let entries
  try {
    entries = await readdir(join(codexHome, ARCHIVE_DIR), { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const latest = new Map<string, { record: CodexThreadRecord; time: number }>()
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
    const record = await readCodexRollout(join(codexHome, ARCHIVE_DIR, entry.name))
    if (record === undefined) continue
    const time = record.items.at(-1)?.createdAtMs ?? 0
    const prior = latest.get(record.threadId)
    if (prior === undefined || time >= prior.time) latest.set(record.threadId, { record, time })
  }
  return [...latest.values()].map(value => value.record)
}

/**
 * Read one legacy Codex rollout JSONL file into a current thread record.
 * @param path Absolute rollout file path (archived or active session).
 * @returns the normalized record, or undefined when unreadable or unnamed.
 */
export async function readCodexRollout(path: string): Promise<CodexThreadRecord | undefined> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return undefined
  }
  const rows: Array<ArchivedRow & { ordinal: number }> = []
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (line.trim() === '') continue
    try {
      const parsed = JSON.parse(line) as ArchivedRow
      rows.push({ ...parsed, ordinal: numberValue(parsed.ordinal) ?? index })
    } catch {
      // One torn archived line must not hide every other archived rollout.
    }
  }
  const meta = rows.find(row => row.type === 'session_meta')?.payload
  const metaRecord = asRecord(meta)
  const threadId = stringValue(metaRecord?.['session_id'])
  if (threadId === undefined) return undefined
  const outputs = new Map<string, unknown>()
  for (const row of rows) {
    const payload = asRecord(row.payload)
    if (row.type === 'response_item' && payload?.['type'] === 'custom_tool_call_output') {
      const callId = stringValue(payload['call_id'])
      if (callId !== undefined) outputs.set(callId, payload['output'])
    }
  }
  const items: CodexThreadItem[] = []
  const turns = new Map<string, { startedAtMs?: number; completedAtMs?: number; status: string }>()
  let cwd = stringValue(metaRecord?.['cwd'])
  for (const row of rows) {
    const payload = asRecord(row.payload)
    if (payload === undefined) continue
    if (row.type === 'turn_context') {
      cwd = stringValue(payload['cwd']) ?? cwd
      continue
    }
    if (row.type === 'event_msg') {
      const turnId = stringValue(payload['turn_id'])
      if (turnId === undefined) continue
      const current = turns.get(turnId) ?? { status: 'completed' }
      const startedAtMs = timestampMs(payload['started_at']) ?? timestampMs(row.timestamp)
      if (payload['type'] === 'task_started' && startedAtMs !== undefined) current.startedAtMs = startedAtMs
      if (payload['type'] === 'task_complete') {
        const completedAtMs = timestampMs(payload['completed_at']) ?? timestampMs(row.timestamp)
        if (completedAtMs !== undefined) current.completedAtMs = completedAtMs
        current.status = 'completed'
      }
      turns.set(turnId, current)
      continue
    }
    if (row.type !== 'response_item') continue
    const type = stringValue(payload['type'])
    const turnId = stringValue(asRecord(payload['internal_chat_message_metadata_passthrough'])?.['turn_id']) ?? `legacy-${row.ordinal}`
    const itemId = stringValue(payload['id']) ?? `${threadId}-${row.ordinal}`
    const createdAtMs = timestampMs(asRecord(payload['internal_chat_message_metadata_passthrough'])?.['create_time'])
      ?? timestampMs(row.timestamp) ?? row.ordinal
    if (type === 'message') {
      const role = stringValue(payload['role'])
      if (role === 'user') items.push({ turnId, itemId, itemType: 'userMessage', createdAtMs, json: { content: payload['content'] } })
      if (role === 'assistant') items.push({ turnId, itemId, itemType: 'agentMessage', createdAtMs, json: { text: joinBlocks(payload['content']) } })
      continue
    }
    if (type === 'custom_tool_call') {
      const callId = stringValue(payload['call_id'])
      const input = parseArguments(payload['input'])
      items.push({
        turnId,
        itemId,
        itemType: 'mcpToolCall',
        createdAtMs,
        json: {
          server: 'codex',
          tool: stringValue(payload['name']) ?? 'tool',
          arguments: input,
          result: { content: outputs.get(callId ?? '') ?? [] },
          status: payload['status'],
          ...(cwd === undefined ? {} : { cwd }),
        },
      })
      continue
    }
    if (type === 'web_search_call') {
      const action = asRecord(payload['action'])
      items.push({ turnId, itemId, itemType: 'webSearch', createdAtMs, json: { query: stringValue(action?.['query']) ?? '' } })
    }
  }
  return {
    threadId,
    ...(cwd === undefined ? {} : { cwd }),
    items,
    turns: [...turns.entries()].map(([turnId, turn]) => ({ turnId, ...turn } satisfies CodexThreadTurn)),
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function timestampMs(value: unknown): number | undefined {
  const numeric = numberValue(value)
  if (numeric !== undefined) return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function joinBlocks(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.map(block => stringValue(asRecord(block)?.['text'])).filter((text): text is string => text !== undefined).join('\n')
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return asRecord(parsed) ?? { input: value }
  } catch {
    return { input: value }
  }
}
