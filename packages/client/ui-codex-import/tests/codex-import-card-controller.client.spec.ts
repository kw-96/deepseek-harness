import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {
  CodexImportHistoryValue, CodexImportRun, CodexImportScanValue, CodexImportUndoValue,
} from '@deepseek-ai/dsh-session-import-codex/types'
import { CodexImportCardController, type CodexImportSettings } from '../src/client/codex-import-card-controller.ts'

/** `run` 远端方法解析出的携带信封。 */
type RunResult = RemoteResult<CodexImportRun>
/** `history` 远端方法解析出的携带信封。 */
type HistoryResult = RemoteResult<CodexImportHistoryValue>

function makeScope(autoSync: boolean | undefined) {
  let listener: (() => void) | undefined
  const subscribe = vi.fn((fn: () => void) => {
    listener = fn
    return () => { listener = undefined }
  })
  const set = vi.fn(async () => {})
  const scope = {
    getSnapshot: () => ({
      status: 'ready',
      value: autoSync === undefined ? undefined : { autoSync },
      base: undefined,
      user: undefined,
      revision: undefined,
      writable: true,
      mode: 'host',
    }),
    subscribe,
    set,
    unset: vi.fn(async () => {}),
    mutate: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  } as unknown as SettingsScope<CodexImportSettings>
  return { scope, subscribe, set, notify: () => { listener?.() } }
}

function makeContext() {
  const run = vi.fn(async (): Promise<RunResult> => ({
    ok: true,
    value: {
      at: 200, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, undoneAt: 0,
      sessions: [{ id: SessionId('codex-t1'), title: '标题' }],
    },
  }))
  const history = vi.fn(async (): Promise<HistoryResult> => ({ ok: true, value: { runs: [] } }))
  const scan = vi.fn(async (): Promise<RemoteResult<CodexImportScanValue>> => ({
    ok: true,
    value: {
      summary: { imported: 2, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0 },
      entries: [{
        threadId: 't1', sessionId: SessionId('codex-t1'), title: '标题', cwd: 'E:/x', kind: 'imported', events: 3,
      }],
    },
  }))
  const undo = vi.fn(async (): Promise<RemoteResult<CodexImportUndoValue>> => ({
    ok: true,
    value: { at: 200, undone: true, changed: 1, failed: 0 },
  }))
  const restore = vi.fn(async (): Promise<RemoteResult<CodexImportUndoValue>> => ({
    ok: true,
    value: { at: 200, undone: false, changed: 1, failed: 0 },
  }))
  const remote = { codexImport: { run, history, scan, undo, restore } }
  const uiWorkspace = { openSession: vi.fn() }
  const ctx = new Context()
  ctx.provide('remote', remote)
  ctx.provide('uiWorkspace', uiWorkspace)
  return { ctx, remote, uiWorkspace, undo }
}

describe('CodexImportCardController', () => {
  it('derives the toggle from the scope and loads history on construction', async () => {
    const { ctx, remote } = makeContext()
    const { scope, subscribe } = makeScope(false)
    const controller = new CodexImportCardController(ctx, scope)
    const face = controller.inject()
    expect(face.hooks.codexImportCard.getSnapshot().autoSync).toBe(false)
    expect(subscribe).toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(remote.codexImport.history).toHaveBeenCalled()
    })
    controller.dispose()
  })

  it('re-derives the toggle when the scope notifies', () => {
    const { ctx } = makeContext()
    const { scope, notify } = makeScope(true)
    const controller = new CodexImportCardController(ctx, scope)
    notify()
    expect(controller.inject().hooks.codexImportCard.getSnapshot().autoSync).toBe(true)
    controller.dispose()
  })

  it('defaults autoSync to false when the scope carries no value', () => {
    const { ctx } = makeContext()
    const controller = new CodexImportCardController(ctx, makeScope(undefined).scope)
    expect(controller.inject().hooks.codexImportCard.getSnapshot().autoSync).toBe(false)
    controller.dispose()
  })

  it('writes the toggle through the scope and updates the snapshot', () => {
    const { ctx } = makeContext()
    const { scope, set } = makeScope(true)
    const controller = new CodexImportCardController(ctx, scope)
    const face = controller.inject()
    face.toggleSync(false)
    expect(set).toHaveBeenCalledWith('autoSync', false)
    expect(face.hooks.codexImportCard.getSnapshot().autoSync).toBe(false)
    controller.dispose()
  })

  it('runs the import, prepends the run, and resets running', async () => {
    const { ctx, remote } = makeContext()
    const controller = new CodexImportCardController(ctx, makeScope(true).scope)
    const face = controller.inject()
    face.runImport()
    expect(face.hooks.codexImportCard.getSnapshot().running).toBe(true)
    await vi.waitFor(() => {
      expect(remote.codexImport.run).toHaveBeenCalled()
    })
    const state = face.hooks.codexImportCard.getSnapshot()
    expect(state.running).toBe(false)
    expect(state.runs).toHaveLength(1)
    expect(state.runs[0]?.imported).toBe(1)
    controller.dispose()
  })

  it('ignores a second run while one is already in flight', async () => {
    const { ctx, remote } = makeContext()
    let resolve: ((value: RunResult) => void) | undefined
    remote.codexImport.run = vi.fn(() => new Promise<RunResult>((r) => { resolve = r }))
    const controller = new CodexImportCardController(ctx, makeScope(true).scope)
    const face = controller.inject()
    face.runImport()
    face.runImport()
    expect(remote.codexImport.run).toHaveBeenCalledTimes(1)
    resolve?.({
      ok: true,
      value: { at: 1, imported: 0, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, undoneAt: 0, sessions: [] },
    })
    await vi.waitFor(() => {
      expect(face.hooks.codexImportCard.getSnapshot().running).toBe(false)
    })
    controller.dispose()
  })

  it('keeps the previous history when the remote run fails', async () => {
    const { ctx, remote } = makeContext()
    remote.codexImport.run = vi.fn(async (): Promise<RunResult> => ({ ok: false, error: new RemoteError('gateway/internal', 'boom', {}) }))
    const controller = new CodexImportCardController(ctx, makeScope(true).scope)
    const face = controller.inject()
    face.runImport()
    await vi.waitFor(() => {
      expect(remote.codexImport.run).toHaveBeenCalled()
    })
    expect(face.hooks.codexImportCard.getSnapshot().runs).toEqual([])
    controller.dispose()
  })

  it('keeps the previous history when the history read fails', async () => {
    const { ctx, remote } = makeContext()
    remote.codexImport.history = vi.fn(async (): Promise<HistoryResult> => ({ ok: false, error: new RemoteError('gateway/internal', 'boom', {}) }))
    const controller = new CodexImportCardController(ctx, makeScope(true).scope)
    await vi.waitFor(() => {
      expect(remote.codexImport.history).toHaveBeenCalled()
    })
    expect(controller.inject().hooks.codexImportCard.getSnapshot().runs).toEqual([])
    controller.dispose()
  })

  it('opens an imported session through the workspace navigation', () => {
    const { ctx, uiWorkspace } = makeContext()
    const controller = new CodexImportCardController(ctx, makeScope(true).scope)
    const id = SessionId('codex-t1')
    controller.inject().openSession(id)
    expect(uiWorkspace.openSession).toHaveBeenCalledWith(id)
    controller.dispose()
  })

  it('ignores later updates and late settlements after disposal', async () => {
    const { ctx, remote } = makeContext()
    let resolveHistory: ((value: HistoryResult) => void) | undefined
    let resolveRun: ((value: RunResult) => void) | undefined
    remote.codexImport.history = vi.fn(() => new Promise<HistoryResult>((r) => { resolveHistory = r }))
    remote.codexImport.run = vi.fn(() => new Promise<RunResult>((r) => { resolveRun = r }))
    const { scope, notify } = makeScope(true)
    const controller = new CodexImportCardController(ctx, scope)
    const face = controller.inject()
    face.runImport()
    controller.dispose()
    face.toggleSync(false)
    notify()
    resolveHistory?.({ ok: true, value: { runs: [] } })
    resolveRun?.({
      ok: true,
      value: { at: 1, imported: 1, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0, undoneAt: 0, sessions: [] },
    })
    await vi.waitFor(() => {
      expect(remote.codexImport.history).toHaveBeenCalled()
    })
    expect(face.hooks.codexImportCard.getSnapshot()).toEqual({ autoSync: true, running: true, busy: false, runs: [], preview: null })
  })

  it('previews the next sweep through the remote and stores the verdicts', async () => {
    const { ctx, remote } = makeContext()
    const controller = new CodexImportCardController(ctx, makeScope(false).scope)
    const face = controller.inject()
    face.preview()
    await vi.waitFor(() => { expect(remote.codexImport.scan).toHaveBeenCalled() })
    const snapshot = face.hooks.codexImportCard.getSnapshot()
    expect(snapshot.busy).toBe(false)
    expect(snapshot.preview?.summary.imported).toBe(2)
    expect(snapshot.preview?.entries[0]?.kind).toBe('imported')
  })

  it('undoes a run through the remote and re-reads history afterwards', async () => {
    const { ctx, remote, undo } = makeContext()
    const controller = new CodexImportCardController(ctx, makeScope(false).scope)
    const face = controller.inject()
    face.undo(200)
    await vi.waitFor(() => { expect(undo).toHaveBeenCalledWith(200) })
    // History is re-read so the card shows the host's own undoneAt stamp.
    await vi.waitFor(() => { expect(remote.codexImport.history).toHaveBeenCalledTimes(2) })
    await vi.waitFor(() => { expect(face.hooks.codexImportCard.getSnapshot().busy).toBe(false) })
  })
})
