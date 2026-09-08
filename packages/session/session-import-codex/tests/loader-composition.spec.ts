import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionAlreadyExistsError } from '@deepseek-ai/dsh-session-persistence'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
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
  await mkdir(join(codexHome, '..', 'workspace'))
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
    ['@deepseek-ai/dsh-workspace', WorkspaceRegistry],
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
    "- name: '@deepseek-ai/dsh-workspace'",
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

describe('session-import-codex through a real Loader composition', () => {
  it('imports only on demand, then groups new and existing sessions by cwd', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    await writeCodexFixture(join(root, 'codex'))
    const first = await loadComposition(compositionRows())

    const id = SessionId('codex-thread-1')
    expect(first.sessions.get(id)).toBeUndefined()
    const run = await first.codexImport.run()
    expect(run.imported).toBe(2)
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

    const workspace = await first.workspaceRegistry.resolveByPath(join(root, 'workspace'))
    expect(workspace?.sessionIds).toEqual([id])
    await workspace?.detachSession(id)
    expect(workspace?.sessionIds).toEqual([])
    const repeat = await first.codexImport.run()
    expect(repeat).toMatchObject({ imported: 0, updated: 0, skippedExisting: 2, skippedEmpty: 1, deferredActive: 0 })
    expect(workspace?.sessionIds).toEqual([id])

    // A thread whose commands carry no absolute cwd falls back to the configured one.
    const relative = await first.sessionPersistence.stat(SessionId('codex-thread-2'))
    expect(relative?.header.cwd).toBe(root)
  })

  it('replaces an imported snapshot and migrates workspace membership when Codex cwd changes', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    await writeCodexFixture(join(root, 'codex'))
    const first = await loadComposition(compositionRows())
    await first.codexImport.run()

    const nextWorkspace = join(root, 'workspace-next')
    await mkdir(nextWorkspace)
    const db = new DatabaseSync(join(root, 'codex', 'thread_history_1.sqlite'))
    db.prepare('INSERT INTO thread_items (thread_id, turn_id, item_id, rollout_ordinal, created_at_ms, item_type, item_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('thread-1', 'turn-a', 'c-next', 5, 9000, 'commandExecution', JSON.stringify({
        type: 'commandExecution', command: 'pwd', cwd: nextWorkspace, status: 'completed', aggregatedOutput: nextWorkspace,
      }))
    db.close()

    const result = await first.codexImport.run()
    const id = SessionId('codex-thread-1')
    expect(result).toMatchObject({ imported: 0, updated: 1, skippedExisting: 1, skippedEmpty: 1, deferredActive: 0 })
    expect(first.sessions.get(id)?.header.cwd).toBe(nextWorkspace)
    expect((await first.sessionPersistence.stat(id))?.header.cwd).toBe(nextWorkspace)
    const oldWorkspace = await first.workspaceRegistry.resolveByPath(join(root, 'workspace'))
    const newWorkspace = await first.workspaceRegistry.resolveByPath(nextWorkspace)
    expect(oldWorkspace?.sessionIds).not.toContain(id)
    expect(newWorkspace?.sessionIds).toContain(id)
  })

  it('defers a changed imported session while a live Agent owns it', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    await writeCodexFixture(join(root, 'codex'))
    const first = await loadComposition(compositionRows())
    await first.codexImport.run()

    const nextWorkspace = join(root, 'workspace-deferred')
    await mkdir(nextWorkspace)
    const db = new DatabaseSync(join(root, 'codex', 'thread_history_1.sqlite'))
    db.prepare('INSERT INTO thread_items (thread_id, turn_id, item_id, rollout_ordinal, created_at_ms, item_type, item_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('thread-1', 'turn-a', 'c-deferred', 6, 10_000, 'commandExecution', JSON.stringify({
        type: 'commandExecution', command: 'pwd', cwd: nextWorkspace, status: 'completed', aggregatedOutput: nextWorkspace,
      }))
    db.close()
    first.provide('agents', { get: (id: SessionId) => id === SessionId('codex-thread-1') ? {} : undefined } as never)

    const result = await first.codexImport.run()
    const id = SessionId('codex-thread-1')
    expect(result).toMatchObject({ imported: 0, updated: 0, skippedExisting: 1, skippedEmpty: 1, deferredActive: 1 })
    expect((await first.sessionPersistence.stat(id))?.header.cwd).toBe(join(root, 'workspace'))
  })

  it('skips live threads and skips stored threads on a cold second load', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    await writeCodexFixture(join(root, 'codex'))
    const first = await loadComposition(compositionRows())
    await first.codexImport.run()

    // Live sessions exist: the sweep counts them as existing without touching storage.
    const liveResult = await runImportSweep(first, resolvedConfig(), new AbortController().signal)
    expect(liveResult.summary).toEqual({ imported: 0, updated: 0, skippedExisting: 2, skippedEmpty: 1, deferredActive: 0 })

    // A pre-aborted sweep stops before the first thread.
    const aborted = await runImportSweep(first, resolvedConfig(), AbortSignal.abort())
    expect(aborted.summary).toEqual({ imported: 0, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0 })

    const second = await loadComposition(compositionRows())
    const coldResult = await runImportSweep(second, resolvedConfig(), new AbortController().signal)
    expect(coldResult.summary).toEqual({ imported: 0, updated: 0, skippedExisting: 2, skippedEmpty: 1, deferredActive: 0 })
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
    expect(result.summary).toEqual({ imported: 2, updated: 0, skippedExisting: 0, skippedEmpty: 1, deferredActive: 0 })

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
    expect(raced.summary).toEqual({ imported: 1, updated: 0, skippedExisting: 1, skippedEmpty: 1, deferredActive: 0 })
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
    expect(result.summary).toEqual({ imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 1, deferredActive: 0 })
    expect(first.sessions.get(SessionId('codex-thread-1'))).toBeUndefined()
    expect(first.sessions.get(SessionId('codex-thread-2'))).toBeDefined()
  })

  it('reports nothing to import when the codex store is absent', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    await mkdir(join(root, 'codex'))
    const first = await loadComposition(compositionRows())
    const result = await runImportSweep(first, resolvedConfig(), new AbortController().signal)
    expect(result.summary).toEqual({ imported: 0, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0 })
    expect((await first.sessionPersistence.list())).toEqual([])
  })

  it('imports an archived rollout when the current Codex SQLite store is absent', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    const codexHome = join(root, 'codex')
    const workspace = join(root, 'archive-workspace')
    await mkdir(join(codexHome, 'archived_sessions'), { recursive: true })
    await mkdir(workspace)
    const rows = [
      { timestamp: '2026-01-01T00:00:00.000Z', type: 'session_meta', payload: { session_id: 'archive-only', cwd: workspace } },
      { timestamp: '2026-01-01T00:00:01.000Z', type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-1', started_at: 1 } },
      { timestamp: '2026-01-01T00:00:02.000Z', type: 'response_item', payload: { type: 'message', id: 'u1', role: 'user', content: [{ type: 'input_text', text: 'archived import' }], internal_chat_message_metadata_passthrough: { turn_id: 'turn-1', create_time: 2 } } },
      { timestamp: '2026-01-01T00:00:03.000Z', type: 'event_msg', payload: { type: 'task_complete', turn_id: 'turn-1', completed_at: 3 } },
    ]
    await writeFile(join(codexHome, 'archived_sessions', 'rollout-archive-only.jsonl'), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`)
    const first = await loadComposition(compositionRows())

    const result = await first.codexImport.run()
    const id = SessionId('codex-archive-only')
    expect(result).toMatchObject({ imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0 })
    expect(first.sessions.get(id)?.header.cwd).toBe(workspace)
    expect((await first.workspaceRegistry.resolveByPath(workspace))?.sessionIds).toContain(id)
  })

  it('groups by the Codex thread-level cwd and imports threads only in the state index', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-import-codex-'))
    const codexHome = join(root, 'codex')
    await mkdir(codexHome)
    await writeCodexFixture(codexHome)
    const overrideWorkspace = join(root, 'override-workspace')
    const indexedWorkspace = join(root, 'indexed-workspace')
    await mkdir(overrideWorkspace)
    await mkdir(indexedWorkspace)

    const db = new DatabaseSync(join(codexHome, 'state_5.sqlite'))
    db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL, cwd TEXT NOT NULL, name TEXT, archived INTEGER NOT NULL DEFAULT 0)')
    db.prepare('INSERT INTO threads (id, rollout_path, cwd, name, archived) VALUES (?, ?, ?, ?, ?)')
      .run('thread-1', join(codexHome, 'thread-1.jsonl'), overrideWorkspace, '整理后的标题', 0)
    db.prepare('INSERT INTO threads (id, rollout_path, cwd, name, archived) VALUES (?, ?, ?, ?, ?)')
      .run('indexed-only', join(codexHome, 'indexed-only.jsonl'), indexedWorkspace, '索引独有线程', 0)
    db.close()
    await writeFile(join(codexHome, 'indexed-only.jsonl'), [
      JSON.stringify({ timestamp: '2026-01-01T00:00:00.000Z', type: 'session_meta', payload: { session_id: 'indexed-only' } }),
      JSON.stringify({ timestamp: '2026-01-01T00:00:01.000Z', type: 'response_item', payload: { type: 'message', id: 'u1', role: 'user', content: [{ type: 'input_text', text: 'indexed question' }], internal_chat_message_metadata_passthrough: { turn_id: 'turn-1', create_time: 1 } } }),
      '',
    ].join('\n'))

    const first = await loadComposition(compositionRows())
    const result = await first.codexImport.run()

    const overridden = SessionId('codex-thread-1')
    const indexed = SessionId('codex-indexed-only')
    expect(result).toMatchObject({ imported: 3, updated: 0, skippedExisting: 0, skippedEmpty: 1, deferredActive: 0 })
    expect(first.sessions.get(overridden)?.header.cwd).toBe(overrideWorkspace)
    expect(first.sessions.get(indexed)?.header.cwd).toBe(indexedWorkspace)
    expect((await first.workspaceRegistry.resolveByPath(overrideWorkspace))?.sessionIds).toContain(overridden)
    expect((await first.workspaceRegistry.resolveByPath(indexedWorkspace))?.sessionIds).toContain(indexed)
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
    expect(run.sessions[1]?.title).toBe('second thread')

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
