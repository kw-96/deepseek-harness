/** Filesystem operations behind the codexShell Remote, built on ctx.fs. */

import { basename, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import type { FileSystem, FsDirEntry, FsTarget } from '@deepseek-ai/dsh-fs'
import type { FsListResponse, FsReadResponse } from '../types.js'

const MAX_LIST_ENTRIES = 1000
const DEFAULT_READ_CAP = 512 * 1024
const BINARY_NUL_PROBE = 4096

/** Directories never descended by recursive search. */
const SKIP_NAMES = new Set(['.git', 'node_modules', '.dsh', 'dist'])

function entryKind(entry: FsDirEntry): 'file' | 'directory' | 'other' {
  if (entry.type === 'file') return 'file'
  if (entry.type === 'directory') return 'directory'
  return 'other'
}

/** List one directory through the fs service. */
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

/** Sniff binary content: a NUL byte in the head marks it unrenderable text. */
function isBinary(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) return true
  }
  return false
}

/** Read one file as text through the fs service, with size caps. */
export async function readTextFile(fs: FileSystem, path: string, maxBytes = DEFAULT_READ_CAP): Promise<FsReadResponse> {
  const target = await fs.resolve(path)
  const info = await fs.stat(target)
  if (info === undefined) return { kind: 'missing', content: '', size: 0, truncated: false }
  const size = info.size ?? 0
  const probeBytes = await fs.readBytes(target, undefined, Math.min(size, BINARY_NUL_PROBE))
  if (isBinary(probeBytes)) {
    return { kind: 'binary', content: '', size, truncated: size > maxBytes }
  }
  if (size > maxBytes) {
    const capped = await fs.readBytes(target, undefined, maxBytes)
    return { kind: 'text', content: new TextDecoder('utf-8', { fatal: false }).decode(capped), size, truncated: true }
  }
  return { kind: 'text', content: await fs.readText(target), size, truncated: false }
}

/** Write one file through the fs service. */
export async function writeTextFile(fs: FileSystem, path: string, content: string): Promise<{ ok: true }> {
  const target = await fs.resolve(path)
  await fs.writeText(target, content)
  return { ok: true }
}

/** Recursive filename search under one root; skips VCS/dependency directories. */
export async function searchNames(
  fs: FileSystem,
  root: string,
  query: string,
): Promise<{ matches: readonly { path: string; isDir: boolean }[]; truncated: boolean }> {
  const rootTarget = await fs.resolve(root)
  const rootInfo = await fs.stat(rootTarget)
  if (rootInfo === undefined) return { matches: [], truncated: false }
  const needle = query.toLowerCase()
  const matches: { path: string; isDir: boolean }[] = []
  let visited = 0
  let truncated = false
  const walk = async (target: FsTarget, prefix: string): Promise<void> => {
    if (truncated) return
    visited += 1
    if (visited > 100_000) { truncated = true; return }
    let entries: FsDirEntry[]
    try {
      entries = await fs.listDir(target)
    } catch {
      return
    }
    for (const entry of entries) {
      if (truncated || matches.length >= 200) { truncated = matches.length >= 200; return }
      const childPath = join(prefix, entry.name)
      if (entry.name.toLowerCase().includes(needle)) {
        matches.push({ path: childPath, isDir: entry.type === 'directory' })
      }
      if (entry.type === 'directory' && !SKIP_NAMES.has(basename(entry.name))) {
        let child: FsTarget
        try {
          child = await fs.resolve(childPath)
        } catch {
          continue
        }
        await walk(child, childPath)
      }
    }
  }
  await walk(rootTarget, root)
  return { matches, truncated }
}
