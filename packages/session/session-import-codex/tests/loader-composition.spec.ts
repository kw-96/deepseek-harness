import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionAlreadyExistsError } from '@deepseek-ai/dsh-session-persistence'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as SessionImportCodex from '../src/index.ts'
import { runImportSweep } from '../src/index.ts'

let root: string | undefined
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Write a two-thread Codex thread-history store plus its title index. */
async function writeCodexFixture(codexHome: string): Promise<void> {
  const db = new DatabaseSync(join(codexHome, 'thread_history_1.sqlite'))
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
  db.prepare('INSERT INTO thread_turns (thread_id, turn_id, started_at, completed_at, status) VALUES (?, ?, ?, ?, ?)')
    .run('thread-1', 'turn-a', 1, 2, 'completed')
  db.prepare('INSERT INTO thread_turns (thread_id, turn_id, started_at, completed_at, status) VALUES (?, ?, ?, ?, ?)')
    .run('thread-2', 'turn-b', 3, 4, 'completed')
  const items = db.prepare('INSERT INTO thread_items (thread_id, turn_id, item_id, rollout_ordinal, created_at_ms, item_type, item_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
  items.run('thread-1', 'turn-a', 'u1', 1, 1000, 'userMessage', JSON.stringify({ type: 'userMessage', content: [{ type: 'text', text: 'hello codex' }] }))
  items.run('thread-1', 'turn-a', 'a1', 2, 2000, 'agentMessage', JSON.stringify({ type: 'agentMessage', text: 'hi from codex' }))
  items.run('thread-1', 'turn-a', 'c1', 3, 3000, 'commandExecution', JSON.stringify({ type: 'commandExecution', command: 'git status', cwd: join(codexHome, '..', 'workspace'), status: 'completed', aggregatedOutput: 'clean' }))
  items.run('thread-1', 'turn-a', 'r1', 4, 4000, 'reasoning', JSON.stringify({ type: 'reasoning' }))
  items.run('thread-2', 'turn-b', 'u2', 1, 5000, 'userMessage', JSON.stringify({ type: 'userMessage', content: [{ type: 'text', text: 'second thread' }] }))
  items.run('thread-2', 'turn-b', 'c2', 2, 6000, 'commandExecution', JSON.stringify({ type: 'commandExecution', command: 'dir', cwd: 'relative-work', status: 'completed', aggregatedOutput: 'ok' }))
  items.run('thread-3', 'turn-c', 'r3', 1, 7000, 'reasoning', JSON.stringify({ type: 'reasoning' }))
  db.close()
  await writeFile(join(codexHome, 'session_index.jsonl'),
    `${JSON.stringify({ id: 'thread-1', thread_name: '整理校验表', updated_at: '2026-09-04T00:00:00Z' })}\n`)
}

async function loadComposition(rows: string[]): Promise<Context> {
  const configPath = join(root as string, 'cordis.yml')
  await writeFile(configPath, `${rows.join('\n')}\n`)
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root as string).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-session-persistence-jsonl', JsonlSessionPersistence],
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-json', StorageJson],
    ['@deepseek-ai/dsh-storage-domain', StorageDomain],
    ['@deepseek-ai/dsh-session-import-codex', SessionImportCodex],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  const unloaded = [...ctx.loader.entries()]
    .filter(entry => entry.fiber === undefined && !entry.disabled)
    .map(entry => entry.options.name)
  expect(unloaded).toEqual([])
  return ctx
}

function compositionRows(): string[] {
  return [
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-session-persistence-jsonl'",
    '  config:',
    `    root: ${JSON.stringify(join(root as string, 'sessions'))}`,
    '    compression: none',
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-json'",
    '  config:',
    `    root: ${JSON.stringify(join(root as string, 'storage'))}`,
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    '    backend: json',
    "- name: '@deepseek-ai/dsh-session-import-codex'",
    '  config:',
    `    codexHome: ${JSON.stringify(join(root as string, 'codex'))}`,
    `    cwd: ${JSON.stringify(root)}`,
    '',
  ]
}

function resolvedConfig(): SessionImportCodex.ResolvedConfig {
  return SessionImportCodex.resolveConfig({ codexHome: join(root as string, 'codex'), cwd: root as string }, process.env)
}

async function waitForLiveThread(ctx: Context, threadId: string): Promise<void> {
  const id = SessionId(`codex-${threadId}`)
  await vi.waitFor(() => {
    expect(ctx.sessions.get(id)).toBeDefined()
  })
}

describe('session-import-codex through a real Loader composition', () => {
  it('imports codex threads durably and publishes them live', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    await writeCodexFixture(join(root, 'codex'))
    const first = await loadComposition(compositionRows())

    const id = SessionId('codex-thread-1')
    await waitForLiveThread(first, 'thread-1')
    await waitForLiveThread(first, 'thread-2')
    const session = first.sessions.get(id)
    if (session === undefined) throw new Error('imported session missing from live store')
    expect(session.header.cwd).toBe(join(root, 'workspace'))
    expect(session.header.createdAt).toBe(1000)
    expect(session.snapshotEvents().map(event => event.type)).toEqual([
      'turn/start', 'user/message', 'session/title', 'assistant/message',
      'tool/call', 'tool/result', 'turn/end', 'session/end-seed',
    ])
    expect(session.deriveMessages()).toHaveLength(3)
    const title = session.snapshotEvents().find(event => event.type === 'session/title')
    if (title === undefined || title.type !== 'session/title') throw new Error('missing title event')
    expect(title.data.title).toBe('整理校验表')

    const snapshot = await first.sessionPersistence.stat(id)
    expect(snapshot).toBeDefined()
    const listed = await first.sessionPersistence.list()
    expect(listed.some(row => row.header.id === id)).toBe(true)
    const handle = await first.sessionPersistence.open(id, 'read')
    const stored = await handle.read()
    await handle.close()
    expect(stored).toEqual(session.snapshotEvents())

    // A thread whose commands carry no absolute cwd falls back to the configured one.
    const relative = await first.sessionPersistence.stat(SessionId('codex-thread-2'))
    expect(relative?.header.cwd).toBe(root)
  })

  it('skips live threads and skips stored threads on a cold second load', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    await writeCodexFixture(join(root, 'codex'))
    const first = await loadComposition(compositionRows())
    await waitForLiveThread(first, 'thread-1')
    await waitForLiveThread(first, 'thread-2')

    // Live sessions exist: the sweep counts them as existing without touching storage.
    const liveResult = await runImportSweep(first, resolvedConfig(), new AbortController().signal)
    expect(liveResult.summary).toEqual({ imported: 0, skippedExisting: 2, skippedEmpty: 1 })

    // A pre-aborted sweep stops before the first thread.
    const aborted = await runImportSweep(first, resolvedConfig(), AbortSignal.abort())
    expect(aborted.summary).toEqual({ imported: 0, skippedExisting: 0, skippedEmpty: 0 })

    const second = await loadComposition(compositionRows())
    const coldResult = await runImportSweep(second, resolvedConfig(), new AbortController().signal)
    expect(coldResult.summary).toEqual({ imported: 0, skippedExisting: 2, skippedEmpty: 1 })
    expect(second.sessions.get(SessionId('codex-thread-1'))).toBeUndefined()
    expect((await second.sessionPersistence.list()).length).toBe(2)
  })

  it('imports even when stat fails, and continues past an already-exists rejection', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    const first = await loadComposition(compositionRows())
    await writeCodexFixture(join(root, 'codex'))
    first.sessionPersistence.stat = async () => { throw new Error('stat boom') }
    const result = await runImportSweep(first, resolvedConfig(), new AbortController().signal)
    expect(result.summary).toEqual({ imported: 2, skippedExisting: 0, skippedEmpty: 1 })

    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    const second = await loadComposition(compositionRows())
    await writeCodexFixture(join(root, 'codex'))
    const secondCreate = second.sessionPersistence.create.bind(second.sessionPersistence)
    second.sessionPersistence.create = async (header) => {
      if (header.id === SessionId('codex-thread-2')) throw new SessionAlreadyExistsError(header.id)
      return secondCreate(header)
    }
    const raced = await runImportSweep(second, resolvedConfig(), new AbortController().signal)
    expect(raced.summary).toEqual({ imported: 1, skippedExisting: 1, skippedEmpty: 1 })
    expect(second.sessions.get(SessionId('codex-thread-1'))).toBeDefined()
    expect(second.sessions.get(SessionId('codex-thread-2'))).toBeUndefined()
  })

  it('logs a failed write and still imports later threads', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    const first = await loadComposition(compositionRows())
    await writeCodexFixture(join(root, 'codex'))
    const originalCreate = first.sessionPersistence.create.bind(first.sessionPersistence)
    first.sessionPersistence.create = async (header) => {
      if (header.id === SessionId('codex-thread-1')) throw new Error('write boom')
      return originalCreate(header)
    }
    const result = await runImportSweep(first, resolvedConfig(), new AbortController().signal)
    expect(result.summary).toEqual({ imported: 1, skippedExisting: 0, skippedEmpty: 1 })
    expect(first.sessions.get(SessionId('codex-thread-1'))).toBeUndefined()
    expect(first.sessions.get(SessionId('codex-thread-2'))).toBeDefined()
  })

  it('reports nothing to import when the codex store is absent', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    const first = await loadComposition(compositionRows())
    const result = await runImportSweep(first, resolvedConfig(), new AbortController().signal)
    expect(result.summary).toEqual({ imported: 0, skippedExisting: 0, skippedEmpty: 0 })
    expect((await first.sessionPersistence.list())).toEqual([])
  })

  it('records runs through the Remote and serves them as history', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    const first = await loadComposition(compositionRows())
    await writeCodexFixture(join(root, 'codex'))

    const run = await first.codexImport.run()
    expect(run.imported).toBe(2)
    expect(run.sessions.map(session => session.id)).toEqual([
      SessionId('codex-thread-1'),
      SessionId('codex-thread-2'),
    ])
    expect(run.sessions[0]?.title).toBe('整理校验表')
    expect(run.sessions[1]?.title).toBe('')

    // A second run finds both already imported and records a new history entry.
    const secondRun = await first.codexImport.run()
    expect(secondRun.imported).toBe(0)
    expect(secondRun.skippedExisting).toBe(2)

    const history = await first.codexImport.history()
    expect(history.runs).toHaveLength(2)
    expect(history.runs[0]?.imported).toBe(0)
    expect(history.runs[1]?.imported).toBe(2)

    // A fresh load re-opens the domain from storage, validating the persisted
    // records through the domain schema on the way back in.
    const second = await loadComposition(compositionRows())
    const replayed = await second.codexImport.history()
    expect(replayed.runs).toHaveLength(2)
    expect(replayed.runs[1]?.sessions.map(session => session.id)).toEqual([
      SessionId('codex-thread-1'),
      SessionId('codex-thread-2'),
    ])
  })
})
