import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadCodexThreadIndex } from '../src/state.ts'

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** 写入一份最小的 Codex state 数据库。 */
interface CodexStateThreadRow {
  id: string
  rollout_path: string
  cwd: string
  name?: string | null
  archived?: number
}

/** 写入一份最小的 Codex state 数据库。 */
async function writeState(codexHome: string, rows: readonly CodexStateThreadRow[]): Promise<void> {
  await mkdir(codexHome, { recursive: true })
  const db = new DatabaseSync(join(codexHome, 'state_5.sqlite'))
  db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL, cwd TEXT NOT NULL, name TEXT, archived INTEGER NOT NULL DEFAULT 0)')
  const insert = db.prepare('INSERT INTO threads (id, rollout_path, cwd, name, archived) VALUES (?, ?, ?, ?, ?)')
  for (const row of rows) {
    insert.run(row.id, row.rollout_path, row.cwd, row.name ?? null, row.archived ?? 0)
  }
  db.close()
}

describe('loadCodexThreadIndex', () => {
  it('returns empty when the state database is absent', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-state-'))
    await expect(loadCodexThreadIndex(root)).resolves.toEqual([])
  })

  it('reads thread id, rollout path, thread-level cwd, curated name, and archived flag', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-state-'))
    await writeState(root, [
      { id: 't1', rollout_path: 'C:\\s\\t1.jsonl', cwd: '\\\\?\\E:\\KW\\Git\\FlowX', name: '项目迭代一', archived: 0 },
      { id: 't2', rollout_path: 'C:\\s\\t2.jsonl', cwd: '\\\\?\\E:\\KW\\Git\\AutoVideo', name: null, archived: 1 },
    ])

    const entries = await loadCodexThreadIndex(root)

    expect(entries).toEqual([
      { threadId: 't1', rolloutPath: 'C:\\s\\t1.jsonl', cwd: 'E:\\KW\\Git\\FlowX', name: '项目迭代一', archived: false },
      { threadId: 't2', rolloutPath: 'C:\\s\\t2.jsonl', cwd: 'E:\\KW\\Git\\AutoVideo', archived: true },
    ])
  })
})
