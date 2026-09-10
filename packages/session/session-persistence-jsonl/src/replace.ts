/** JSONL 会话快照替换的可恢复跨目录发布。 */

import { randomBytes } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ensureDurableDirectoryWin32, publishNewFileWin32 } from './win32.ts'

const JOURNAL_PREFIX = '.dsh-session-replace-'
const JOURNAL_SUFFIX = '.json'

interface ReplaceJournal {
  readonly oldPath: string
  readonly newPath: string
  readonly tempPath: string
  readonly backupPath: string
}

/**
 * 在旧会话路径与新 cwd 路径之间替换 JSONL 快照。
 * @param root 会话存储根目录。
 * @param oldPath 当前已验证的日志路径。
 * @param newPath 新 header 对应的日志路径。
 * @param content 已同步编码的 header 与事件内容。
 */
export async function replaceJsonlArtifact(
  root: string,
  oldPath: string,
  newPath: string,
  content: Buffer | string,
): Promise<void> {
  await ensureDirectory(root)
  await ensureDirectory(dirname(newPath))
  if (oldPath !== newPath && await exists(newPath)) {
    throw new Error(`cannot replace JSONL session: target already exists at ${newPath}`)
  }
  const nonce = randomBytes(8).toString('hex')
  const journalPath = join(root, `${JOURNAL_PREFIX}${nonce}${JOURNAL_SUFFIX}`)
  const tempPath = `${newPath}.${nonce}.tmp`
  const backupPath = `${oldPath}.${nonce}.bak`
  const journal: ReplaceJournal = { oldPath, newPath, tempPath, backupPath }
  await writeSynced(tempPath, content)
  await writeSynced(journalPath, JSON.stringify(journal))
  try {
    await moveWithoutReplacement(oldPath, backupPath)
    await publishWithoutReplacement(tempPath, newPath)
    await removeFile(backupPath)
    await removeFile(journalPath)
  } catch (error) {
    // The journal names every artifact needed by startup recovery. Keep it.
    throw error
  }
}

/** Recover incomplete replacements before any JSONL discovery starts. */
export async function recoverJsonlReplacements(root: string): Promise<void> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (isENOENT(error)) return
    throw error
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(JOURNAL_PREFIX) || !entry.name.endsWith(JOURNAL_SUFFIX)) continue
    const journalPath = join(root, entry.name)
    const journal = await readJournal(journalPath)
    const [oldExists, newExists, backupExists] = await Promise.all([
      exists(journal.oldPath),
      exists(journal.newPath),
      exists(journal.backupPath),
    ])
    if (newExists) {
      if (backupExists) await removeFile(journal.backupPath)
      await removeFile(journal.tempPath)
      await removeFile(journalPath)
      continue
    }
    if (backupExists) {
      if (oldExists) throw new Error(`cannot recover JSONL replacement: both old and backup exist for ${journal.oldPath}`)
      await moveWithoutReplacement(journal.backupPath, journal.oldPath)
      await removeFile(journal.tempPath)
      await removeFile(journalPath)
      continue
    }
    if (oldExists) {
      await removeFile(journal.tempPath)
      await removeFile(journalPath)
      continue
    }
    throw new Error(`cannot recover JSONL replacement: no committed artifact for ${journal.oldPath}`)
  }
}

async function readJournal(path: string): Promise<ReplaceJournal> {
  const text = await readFile(path, 'utf8')
  const value = JSON.parse(text) as Partial<ReplaceJournal>
  if (typeof value.oldPath !== 'string' || typeof value.newPath !== 'string'
    || typeof value.tempPath !== 'string' || typeof value.backupPath !== 'string') {
    throw new Error(`invalid JSONL replacement journal at ${path}`)
  }
  return value as ReplaceJournal
}

async function ensureDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') {
    await ensureDurableDirectoryWin32(path)
    return
  }
  await mkdir(path, { recursive: true, mode: 0o700 })
}

async function writeSynced(path: string, content: Buffer | string): Promise<void> {
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(content)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function moveWithoutReplacement(source: string, target: string): Promise<void> {
  if (process.platform === 'win32') {
    await publishNewFileWin32(source, target)
    return
  }
  await rename(source, target)
  await syncDirectory(dirname(source))
  if (dirname(source) !== dirname(target)) await syncDirectory(dirname(target))
}

async function publishWithoutReplacement(source: string, target: string): Promise<void> {
  if (process.platform === 'win32') {
    await publishNewFileWin32(source, target)
    return
  }
  await rename(source, target)
  await syncDirectory(dirname(target))
}

async function removeFile(path: string): Promise<void> {
  await rm(path, { force: true })
  if (process.platform !== 'win32') await syncDirectory(dirname(path))
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (isENOENT(error)) return false
    throw error
  }
}

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}
