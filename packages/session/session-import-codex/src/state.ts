/** Read Codex's state database for the authoritative thread index. */

import { join } from 'node:path'

/** One indexed Codex thread from `state_5.sqlite`. */
export interface CodexThreadIndexEntry {
  /** Codex thread id, reused as the DSH session id prefix. */
  readonly threadId: string
  /** Absolute rollout JSONL file holding this thread's complete transcript. */
  readonly rolloutPath: string
  /** Thread-level working directory, the source for workspace grouping. */
  readonly cwd?: string
  /** Curated short title Codex displays in its sidebar. */
  readonly name?: string
  /** Whether Codex currently archives this thread. */
  readonly archived: boolean
}

const STATE_DB = 'state_5.sqlite'

/** Strip the Windows extended-length `\\?\` prefix Codex stores on paths. */
function normalizeCodexPath(value: string): string {
  return value.replace(/^\\\\\?\\/u, '')
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Read Codex's authoritative thread index from `state_5.sqlite`.
 * @param codexHome Codex home directory.
 * @returns indexed threads, or empty when the state database is absent.
 */
export async function loadCodexThreadIndex(codexHome: string): Promise<CodexThreadIndexEntry[]> {
  const { DatabaseSync } = await import('node:sqlite')
  let db
  try {
    db = new DatabaseSync(join(codexHome, STATE_DB), { readOnly: true })
  } catch {
    return []
  }
  try {
    const rows = db.prepare(
      'SELECT id, rollout_path, cwd, name, archived FROM threads',
    ).all() as unknown as Array<{
      id: string
      rollout_path: string
      cwd: string
      name: string | null
      archived: number
    }>
    const entries: CodexThreadIndexEntry[] = []
    for (const row of rows) {
      const cwd = asNonEmptyString(row.cwd)
      const name = asNonEmptyString(row.name ?? undefined)
      entries.push({
        threadId: row.id,
        rolloutPath: row.rollout_path,
        ...(cwd === undefined ? {} : { cwd: normalizeCodexPath(cwd) }),
        ...(name === undefined ? {} : { name }),
        archived: row.archived === 1,
      })
    }
    return entries
  } finally {
    db.close()
  }
}
