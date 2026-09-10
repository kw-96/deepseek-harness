/** Per-workspace additional project directories, persisted under the DSH home. */

import { homedir } from 'node:os'
import { join } from 'node:path'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { ProjectDirsResponse } from '../types.js'

/** Directory count bound per workspace. */
const MAX_DIRS = 32

function storePath(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'storages', 'dsh-codex-shell', 'dirs.json')
}

interface StoredDirs {
  [workspaceId: string]: readonly string[]
}

async function load(fs: FileSystem): Promise<StoredDirs> {
  const path = storePath()
  const target = await fs.resolve(path)
  const info = await fs.stat(target)
  if (info === undefined) return {}
  try {
    const parsed = JSON.parse(await fs.readText(target)) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as StoredDirs
  } catch {
    return {}
  }
}

async function save(fs: FileSystem, dirs: StoredDirs): Promise<void> {
  const path = storePath()
  const target = await fs.resolve(path)
  await fs.writeText(target, JSON.stringify(dirs, undefined, 2) + '\n')
}

/** Read one workspace's additional directories (empty when absent). */
export async function projectDirs(fs: FileSystem, workspaceId: string): Promise<ProjectDirsResponse> {
  const dirs = await load(fs)
  return { dirs: dirs[workspaceId] ?? [] }
}

/** Replace one workspace's additional directories with a validated list. */
export async function projectSetDirs(
  fs: FileSystem, workspaceId: string, next: readonly string[],
): Promise<ProjectDirsResponse> {
  const unique = [...new Set(next.map(dir => dir.trim()).filter(dir => dir !== ''))].slice(0, MAX_DIRS)
  const dirs = await load(fs)
  await save(fs, { ...dirs, [workspaceId]: unique })
  return { dirs: unique }
}

/** Add one directory; reject duplicates or a full list. */
export async function projectAddDir(
  fs: FileSystem, workspaceId: string, path: string,
): Promise<{ dirs: readonly string[]; rejected: string | null }> {
  const dirs = await load(fs)
  const current = dirs[workspaceId] ?? []
  const trimmed = path.trim()
  if (trimmed === '') return { dirs: current, rejected: 'Directory path must not be blank.' }
  if (current.includes(trimmed)) return { dirs: current, rejected: `Directory "${trimmed}" is already registered.` }
  if (current.length >= MAX_DIRS) return { dirs: current, rejected: `At most ${MAX_DIRS} directories per workspace.` }
  const next = [...current, trimmed]
  await save(fs, { ...dirs, [workspaceId]: next })
  return { dirs: next, rejected: null }
}
