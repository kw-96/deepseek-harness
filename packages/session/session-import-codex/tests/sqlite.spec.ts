import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadCodexThreads } from '../src/sqlite.ts'

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function openStore(): DatabaseSync {
  const db = new DatabaseSync(join(root as string, 'thread_history_1.sqlite'))
  db.exec([
    'CREATE TABLE thread_turns (',
    '  thread_id TEXT NOT NULL, turn_id TEXT NOT NULL,',
    '  started_at INTEGER, completed_at INTEGER, status TEXT NOT NULL',
    ')',
  ].join('\n'))
  db.exec([
    'CREATE TABLE thread_items (',
    '  thread_id TEXT NOT NULL, turn_id TEXT NOT NULL, item_id TEXT NOT NULL,',
    '  rollout_ordinal INTEGER NOT NULL, created_at_ms INTEGER NOT NULL,',
    '  item_type TEXT NOT NULL DEFAULT \'\', item_json TEXT NOT NULL,',
    '  updated_at_ordinal INTEGER NOT NULL DEFAULT 0',
    ')',
  ].join('\n'))
  return db
}

describe('loadCodexThreads', () => {
  it('returns undefined when the thread-history database does not exist', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-sqlite-'))
    await expect(loadCodexThreads(root)).resolves.toBeUndefined()
  })

  it('reads items, turns, and titles into ordered records', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-sqlite-'))
    const db = openStore()
    const turns = db.prepare('INSERT INTO thread_turns (thread_id, turn_id, started_at, completed_at, status) VALUES (?, ?, ?, ?, ?)')
    turns.run('t1', 'turn-a', 1, 2, 'completed')
    turns.run('t1', 'turn-b', null, null, 'cancelled')
    const items = db.prepare('INSERT INTO thread_items (thread_id, turn_id, item_id, rollout_ordinal, created_at_ms, item_type, item_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
    items.run('t1', 'turn-a', 'i1', 1, 10, 'userMessage', JSON.stringify({ type: 'userMessage' }))
    items.run('t1', 'turn-a', 'i2', 2, 20, 'agentMessage', JSON.stringify({ type: 'agentMessage' }))
    db.close()
    await writeFile(join(root, 'session_index.jsonl'),
      `${JSON.stringify({ id: 't1', thread_name: 'named', updated_at: 'x' })}\n`)

    const records = await loadCodexThreads(root)
    expect(records).toBeDefined()
    expect(records?.length).toBe(1)
    const record = records?.[0]
    expect(record?.threadId).toBe('t1')
    expect(record?.title).toBe('named')
    expect(record?.items.map(item => item.itemId)).toEqual(['i1', 'i2'])
    expect(record?.turns).toHaveLength(2)
    expect(record?.turns[0]).toEqual({ turnId: 'turn-a', startedAtMs: 1000, completedAtMs: 2000, status: 'completed' })
    expect(record?.turns[1]).toEqual({ turnId: 'turn-b', status: 'cancelled' })
  })

  it('skips malformed rows and invalid index lines', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-sqlite-'))
    const db = openStore()
    const items = db.prepare('INSERT INTO thread_items (thread_id, turn_id, item_id, rollout_ordinal, created_at_ms, item_type, item_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
    items.run('t1', 'turn-a', 'bad-json', 1, 10, 'userMessage', '{not json')
    items.run('t1', 'turn-a', 'bad-record', 2, 20, 'userMessage', '[1,2,3]')
    items.run('t1', 'turn-a', '', 3, 30, 'userMessage', JSON.stringify({ type: 'userMessage' }))
    items.run('t1', 'turn-a', 'ok', 4, 40, 'userMessage', JSON.stringify({ type: 'userMessage' }))
    db.close()
    await writeFile(join(root, 'session_index.jsonl'), [
      'garbage',
      '3',
      JSON.stringify({ thread_name: 'no id' }),
      JSON.stringify({ id: 't1', thread_name: '' }),
      JSON.stringify({ id: 't1', thread_name: 3 }),
      '',
    ].join('\n'))

    const records = await loadCodexThreads(root)
    expect(records).toHaveLength(1)
    expect(records?.[0]?.items.map(item => item.itemId)).toEqual(['ok'])
    expect(records?.[0]?.title).toBeUndefined()
  })

  it('treats an unreadable index as absent and drops non-integer turn stamps', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-sqlite-'))
    const db = openStore()
    db.prepare('INSERT INTO thread_turns (thread_id, turn_id, started_at, completed_at, status) VALUES (?, ?, ?, ?, ?)')
      .run('t1', 'turn-a', 1.5, 2, 'completed')
    db.close()
    await mkdir(join(root, 'session_index.jsonl')) // a directory: unreadable as a file

    const records = await loadCodexThreads(root)
    expect(records).toHaveLength(0)
  })
})
