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

/** One Codex project with its ordered root directories. */
export interface CodexProjectIndexEntry {
  /** Project display name shown in the Codex sidebar tier. */
  readonly name: string
  /** Ordered directory roots whose prefix matches its threads. */
  readonly roots: readonly string[]
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

/**
 * Read Codex projects and their ordered root directories from `state_5.sqlite`.
 * @param codexHome Codex home directory.
 * @returns projects ordered by Codex position, or empty when absent.
 */
export async function loadCodexProjects(codexHome: string): Promise<CodexProjectIndexEntry[]> {
  const { DatabaseSync } = await import('node:sqlite')
  let db
  try {
    db = new DatabaseSync(join(codexHome, STATE_DB), { readOnly: true })
  } catch {
    return []
  }
  try {
    const projects = db.prepare('SELECT id, name FROM projects ORDER BY position').all() as unknown as Array<{
      id: string
      name: string
    }>
    const roots = db.prepare('SELECT project_id, path FROM project_roots ORDER BY project_id, position').all() as unknown as Array<{
      project_id: string
      path: string
    }>
    const byProject = new Map<string, string[]>()
    for (const root of roots) {
      const list = byProject.get(root.project_id) ?? []
      list.push(normalizeCodexPath(root.path))
      byProject.set(root.project_id, list)
    }
    const entries: CodexProjectIndexEntry[] = []
    for (const project of projects) {
      const name = asNonEmptyString(project.name)
      if (name === undefined) continue
      entries.push({ name, roots: byProject.get(project.id) ?? [] })
    }
    return entries
  } finally {
    db.close()
  }
}
