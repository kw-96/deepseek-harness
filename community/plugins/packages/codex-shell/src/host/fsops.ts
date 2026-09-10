/** Filesystem operations behind the codexShell Remote, built on ctx.fs. */

import type {} from '@deepseek-ai/dsh-fs'
import type { FileSystem, FsDirEntry } from '@deepseek-ai/dsh-fs'
import type { FsListResponse } from '../types.js'

const MAX_LIST_ENTRIES = 1000

function entryKind(entry: FsDirEntry): 'file' | 'directory' | 'other' {
  if (entry.type === 'file') return 'file'
  if (entry.type === 'directory') return 'directory'
  return 'other'
}

/** List one directory through the fs service (the workspace picker's browse step). */
export async function listDirectory(fs: FileSystem, path: string): Promise<FsListResponse> {
  const target = await fs.resolve(path)
  const entries = await fs.listDir(target)
  return {
    entries: entries.slice(0, MAX_LIST_ENTRIES).map(entry => ({
      name: entry.name, kind: entryKind(entry), size: entry.type === 'file' ? (entry.size ?? null) : null,
    })),
    truncated: entries.length > MAX_LIST_ENTRIES,
  }
}
