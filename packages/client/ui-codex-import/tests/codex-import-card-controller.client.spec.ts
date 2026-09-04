import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { CodexImportCardController, type CodexImportSettings } from '../src/client/codex-import-card-controller.ts'

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
  const ctx = new Context()
  const remote = {
    codexImport: {
      run: vi.fn(async () => ({ ok: true, value: { at: 200, imported: 1, skippedExisting: 0, skippedEmpty: 0, sessions: [{ id: SessionId('codex-t1'), title: '标题' }] } })),
      history: vi.fn(async () => ({ ok: true, value: { runs: [] } })),
    },
  }
  const sessions = { open: vi.fn() }
  ctx.provide('remote', remote)
  ctx.provide('sessions', sessions)
  return { ctx, remote, sessions }
}

describe('CodexImportCardController', () => {
  it('derives the toggle from the scope and loads history on construction', async () => {
    const { ctx } = makeContext()
    const { scope, subscribe } = makeScope(false)
    const controller = new CodexImportCardController(ctx, scope)
    const face = controller.inject()
    expect(face.hooks.codexImportCard.getSnapshot().autoSync).toBe(false)
    expect(subscribe).toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(ctx.get('remote').codexImport.history).toHaveBeenCalled()
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

  it('defaults autoSync to true when the scope carries no value', () => {
    const { ctx } = makeContext()
    const controller = new CodexImportCardController(ctx, makeScope(undefined).scope)
    expect(controller.inject().hooks.codexImportCard.getSnapshot().autoSync).toBe(true)
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
    let resolve: ((value: unknown) => void) | undefined
    remote.codexImport.run = vi.fn(() => new Promise((r) => { resolve = r }))
    const controller = new CodexImportCardController(ctx, makeScope(true).scope)
    const face = controller.inject()
    face.runImport()
    face.runImport()
    expect(remote.codexImport.run).toHaveBeenCalledTimes(1)
    resolve?.({ ok: true, value: { at: 1, imported: 0, skippedExisting: 0, skippedEmpty: 0, sessions: [] } })
    await vi.waitFor(() => {
      expect(face.hooks.codexImportCard.getSnapshot().running).toBe(false)
    })
    controller.dispose()
  })

  it('keeps the previous history when the remote run fails', async () => {
    const { ctx, remote } = makeContext()
    remote.codexImport.run = vi.fn(async () => ({ ok: false, error: { code: 'x', message: 'boom' } }))
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
    remote.codexImport.history = vi.fn(async () => ({ ok: false, error: { code: 'x', message: 'boom' } }))
    const controller = new CodexImportCardController(ctx, makeScope(true).scope)
    await vi.waitFor(() => {
      expect(remote.codexImport.history).toHaveBeenCalled()
    })
    expect(controller.inject().hooks.codexImportCard.getSnapshot().runs).toEqual([])
    controller.dispose()
  })

  it('opens an imported session through the sessions service', () => {
    const { ctx, sessions } = makeContext()
    const controller = new CodexImportCardController(ctx, makeScope(true).scope)
    const id = SessionId('codex-t1')
    controller.inject().openSession(id)
    expect(sessions.open).toHaveBeenCalledWith(id)
    controller.dispose()
  })

  it('ignores later updates and late settlements after disposal', async () => {
    const { ctx } = makeContext()
    let resolveHistory: ((value: unknown) => void) | undefined
    let resolveRun: ((value: unknown) => void) | undefined
    const remote = ctx.get('remote')
    remote.codexImport.history = vi.fn(() => new Promise((r) => { resolveHistory = r }))
    remote.codexImport.run = vi.fn(() => new Promise((r) => { resolveRun = r }))
    const { scope, notify } = makeScope(true)
    const controller = new CodexImportCardController(ctx, scope)
    const face = controller.inject()
    face.runImport()
    controller.dispose()
    face.toggleSync(false)
    notify()
    resolveHistory?.({ ok: true, value: { runs: [] } })
    resolveRun?.({ ok: true, value: { at: 1, imported: 1, skippedExisting: 0, skippedEmpty: 0, sessions: [] } })
    await vi.waitFor(() => {
      expect(remote.codexImport.history).toHaveBeenCalled()
    })
    expect(face.hooks.codexImportCard.getSnapshot()).toEqual({ autoSync: true, running: true, runs: [] })
  })
})
