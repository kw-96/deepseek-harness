import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import {
  RemoteStream,
  RemoteStreamCarrierError,
  type ClientRemote,
  type RemoteStreamOptions,
} from '@deepseek-ai/dsh-api-gateway/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { streamHandle } from '@deepseek-ai/dsh-remote-mock'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError, type RemoteFailure, type RemoteResult, type RemoteStreamHandle } from '@deepseek-ai/dsh-typert-protocol'
import * as WorkspaceClientPlugin from '../src/client/index.ts'
import {
  ClientWorkspaceModel,
  createWorkspaceStateStream,
  WorkspaceArchiveError,
  WorkspaceController,
  WorkspaceCreateError,
  type WorkspaceFollowSink,
  type WorkspaceRemote,
} from '../src/client/index.ts'
import type {
  WorkspaceArchiveSessionRequest,
  WorkspaceArchiveValue,
  WorkspaceCreateRequest,
  WorkspaceCreateValue,
  WorkspaceDeleteRequest,
  WorkspaceDeleteValue,
  WorkspaceFollowFrame,
  WorkspaceInitializeDefaultRequest,
  WorkspaceInsertBeforeRequest,
  WorkspaceInsertSessionBeforeRequest,
  WorkspaceOrderValue,
  WorkspacePinSessionRequest,
  WorkspacePinValue,
  WorkspaceRenameRequest,
  WorkspaceUnarchiveSessionRequest,
  WorkspaceUnpinSessionRequest,
  WorkspaceId,
  WorkspaceValue,
  WorkspaceView,
} from '../src/types.ts'

const AVAILABLE_CONNECTION = {
  generation: {
    getSnapshot: () => ({ id: 1, host: { home: '/home/fixture' } }),
    subscribe: () => () => {},
  },
}

function workspaceClient(
  remote: WorkspaceRemote,
  connection: Pick<ConnectionHandle, 'generation'> = AVAILABLE_CONNECTION,
): ClientRemote {
  return {
    workspace: remote,
    $stream: <Item>(options: RemoteStreamOptions<Item>) => new RemoteStream(connection, options),
  } as unknown as ClientRemote
}

interface Generation {
  readonly frames: readonly WorkspaceFollowFrame[]
  readonly error?: unknown
  readonly hold?: boolean
  readonly afterAbort?: () => void
  readonly afterAbortError?: unknown
}

const baseline = (id?: string): Extract<WorkspaceFollowFrame, { type: 'baseline' }> => ({
  type: 'baseline',
  value: {
    items: id === undefined ? [] : [{
      workspaceId: id as never,
      path: `/work/${id}`,
      title: id,
      sessionIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    archivedSessionIds: [],
    pinnedSessionIds: [],
  },
})

const wid = (id: string): WorkspaceId => id as WorkspaceId
const sid = (id: string): SessionId => SessionId(id)

function workspace(id: string, overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    workspaceId: wid(id),
    path: `/work/${id}`,
    title: id,
    sessionIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function remoteOk<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}

function remoteFailure(error: RemoteFailure): RemoteResult<never> {
  return { ok: false, error }
}

function accepts(overrides: Partial<WorkspaceFollowSink> = {}): WorkspaceFollowSink {
  const ignore = (): void => {}
  return {
    replaceBaseline: ignore,
    upsertView: ignore,
    removeView: ignore,
    replaceOrder: ignore,
    replaceArchived: ignore,
    replacePinned: ignore,
    ...overrides,
  }
}

class ScriptedWorkspaceRemote implements WorkspaceRemote {
  readonly signals: AbortSignal[] = []
  calls = 0

  constructor(private readonly generations: readonly Generation[]) {}

  create(_request: WorkspaceCreateRequest): Promise<RemoteResult<WorkspaceCreateValue>> {
    throw new Error('unused')
  }

  rename(_request: WorkspaceRenameRequest): Promise<RemoteResult<WorkspaceValue>> {
    throw new Error('unused')
  }

  delete(_request: WorkspaceDeleteRequest): Promise<RemoteResult<WorkspaceDeleteValue>> {
    throw new Error('unused')
  }

  insertBefore(_request: WorkspaceInsertBeforeRequest): Promise<RemoteResult<WorkspaceOrderValue>> {
    throw new Error('unused')
  }

  insertSessionBefore(_request: WorkspaceInsertSessionBeforeRequest): Promise<RemoteResult<WorkspaceValue>> {
    throw new Error('unused')
  }

  attachSession(_request: { workspaceId: WorkspaceId; sessionId: SessionId }): Promise<RemoteResult<WorkspaceValue>> {
    throw new Error('unused')
  }

  detachSession(_request: { workspaceId: WorkspaceId; sessionId: SessionId }): Promise<RemoteResult<WorkspaceValue>> {
    throw new Error('unused')
  }

  archiveSession(_request: WorkspaceArchiveSessionRequest): Promise<RemoteResult<WorkspaceArchiveValue>> {
    throw new Error('unused')
  }

  unarchiveSession(_request: WorkspaceUnarchiveSessionRequest): Promise<RemoteResult<WorkspaceArchiveValue>> {
    throw new Error('unused')
  }

  initializeDefault(_request: WorkspaceInitializeDefaultRequest): Promise<RemoteResult<WorkspaceValue>> {
    throw new Error('unused')
  }

  pinSession(_request: WorkspacePinSessionRequest): Promise<RemoteResult<WorkspacePinValue>> {
    throw new Error('unused')
  }

  unpinSession(_request: WorkspaceUnpinSessionRequest): Promise<RemoteResult<WorkspacePinValue>> {
    throw new Error('unused')
  }

  follow(signal = new AbortController().signal): RemoteStreamHandle<WorkspaceFollowFrame, never> {
    return streamHandle<WorkspaceFollowFrame, never>(this.scriptedFollow(signal))
  }

  private async *scriptedFollow(signal: AbortSignal): AsyncIterable<WorkspaceFollowFrame> {
    const generation = this.generations[this.calls++]
    if (generation === undefined) throw new Error('no scripted Workspace generation')
    this.signals.push(signal)
    for (const frame of generation.frames) yield frame
    if (generation.error !== undefined) throw generation.error
    if (generation.hold === true && !signal.aborted) {
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
      generation.afterAbort?.()
      if (generation.afterAbortError !== undefined) throw generation.afterAbortError
    }
  }
}

class CommandWorkspaceRemote implements WorkspaceRemote {
  readonly create = vi.fn<WorkspaceRemote['create']>(request => Promise.resolve(remoteOk({
    workspace: workspace('created', { path: request.path }),
    created: true,
  })))

  readonly rename = vi.fn<WorkspaceRemote['rename']>(request => Promise.resolve(remoteOk({
    workspace: workspace(String(request.workspaceId), { title: request.title }),
  })))

  readonly delete = vi.fn<WorkspaceRemote['delete']>(() => Promise.resolve(remoteOk({ deleted: true })))

  readonly insertBefore = vi.fn<WorkspaceRemote['insertBefore']>(request => Promise.resolve(remoteOk({
    workspaceIds: [request.workspaceId],
  })))

  readonly insertSessionBefore = vi.fn<WorkspaceRemote['insertSessionBefore']>(request => Promise.resolve(remoteOk({
    workspace: workspace(String(request.workspaceId), { sessionIds: [request.sessionId] }),
  })))

  readonly attachSession = vi.fn<WorkspaceRemote['attachSession']>(request => Promise.resolve(remoteOk({
    workspace: workspace(String(request.workspaceId), { sessionIds: [request.sessionId] }),
  })))

  readonly detachSession = vi.fn<WorkspaceRemote['detachSession']>(request => Promise.resolve(remoteOk({
    workspace: workspace(String(request.workspaceId), { sessionIds: [] }),
  })))

  readonly archiveSession = vi.fn<WorkspaceRemote['archiveSession']>(request => Promise.resolve(remoteOk({
    archivedSessionIds: [request.sessionId],
  })))

  readonly unarchiveSession = vi.fn<WorkspaceRemote['unarchiveSession']>(() => Promise.resolve(remoteOk({
    archivedSessionIds: [],
  })))

  readonly pinSession = vi.fn<WorkspaceRemote['pinSession']>(request => Promise.resolve(remoteOk({
    pinnedSessionIds: [request.sessionId],
  })))

  readonly unpinSession = vi.fn<WorkspaceRemote['unpinSession']>(() => Promise.resolve(remoteOk({
    pinnedSessionIds: [],
  })))

  readonly initializeDefault = vi.fn<WorkspaceRemote['initializeDefault']>(() => Promise.resolve(remoteOk({
    workspace: workspace('default'),
  })))

  follow(_signal?: AbortSignal): RemoteStreamHandle<WorkspaceFollowFrame, never> {
    return streamHandle<WorkspaceFollowFrame, never>((async function * (): AsyncIterable<WorkspaceFollowFrame> {})())
  }
}

async function waitFor(check: () => void): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      check()
      return
    } catch {
      await Promise.resolve()
    }
  }
  check()
}

function provideClientServices(ctx: Context, remote: WorkspaceRemote): void {
  const connection: ConnectionHandle = {
    isLoopback: true,
    generation: AVAILABLE_CONNECTION.generation,
    state: { getSnapshot: () => 'connected' as const, subscribe: () => () => {} },
    rpc: {
      call: () => Promise.reject(new Error('unexpected generic RPC call')),
    },
    reconnect: () => {},
    registerGenerationSource: () => () => {},
    start: () => ({ stop: () => {} }),
  }
  ctx.reflect.provide('connection', connection)
  ctx.reflect.provide('remote', workspaceClient(remote, connection))
  ctx.reflect.provide('remote.workspace', remote)
}

describe('Workspace Controller Client apply', () => {
  it('provides the Workspace service and stops its follow generation with the plugin fiber', async () => {
    const ctx = new Context()
    const remote = new ScriptedWorkspaceRemote([{ frames: [baseline('mounted')], hold: true }])
    provideClientServices(ctx, remote)
    const fiber = ctx.plugin(WorkspaceClientPlugin)
    await fiber
    await waitFor(() => {
      expect(ctx.workspaces.list.getSnapshot()).toMatchObject({
        phase: 'ready',
        state: 'idle',
        items: [{ workspaceId: 'mounted' }],
      })
    })

    await fiber.dispose()

    expect(remote.signals[0]?.aborted).toBe(true)
    expect(ctx.get('workspaces')).toBeUndefined()
  })

  it('publishes exhausted carrier retries as a gateway/internal error state', async () => {
    const ctx = new Context()
    // Neither generation reaches an accepted baseline, so the retry budget runs
    // out and the escaping carrier failure crosses the stream boundary marked.
    const remote = new ScriptedWorkspaceRemote([
      { frames: [], error: new RemoteStreamCarrierError('generation lost') },
      { frames: [], error: new RemoteStreamCarrierError('generation lost again') },
    ])
    provideClientServices(ctx, remote)
    const fiber = ctx.plugin(WorkspaceClientPlugin)
    await fiber
    await waitFor(() => {
      expect(ctx.workspaces.list.getSnapshot()).toMatchObject({
        state: 'error',
        error: { code: 'gateway/internal', message: 'generation lost again' },
      })
    })
    expect(remote.calls).toBe(2)
    await fiber.dispose()
  })

  it('marks carrier loss while retrying and publishes a later protocol failure', async () => {
    const ctx = new Context()
    const remote = new ScriptedWorkspaceRemote([
      {
        frames: [baseline('old')],
        error: new RemoteStreamCarrierError('generation lost'),
      },
      { frames: [baseline('fresh'), baseline('duplicate')] },
    ])
    provideClientServices(ctx, remote)
    const carrierFailure = vi.spyOn(ClientWorkspaceModel.prototype, 'handleCarrierFailure')
    const streamFailure = vi.spyOn(ClientWorkspaceModel.prototype, 'handleStreamFailure')
    const fiber = ctx.plugin(WorkspaceClientPlugin)
    await fiber
    await waitFor(() => {
      expect(ctx.workspaces.list.getSnapshot()).toMatchObject({
        phase: 'ready',
        state: 'error',
        items: [{ workspaceId: 'fresh' }],
        error: { code: 'gateway/internal', message: 'Workspace state stream emitted more than one opening snapshot' },
      })
    })

    expect(carrierFailure).toHaveBeenCalledOnce()
    expect(streamFailure).toHaveBeenCalledOnce()
    await fiber.dispose()
  })
})

describe('Workspace state stream', () => {
  it('delivers one baseline followed by increments', async () => {
    const opening = baseline('one')
    const workspace = opening.value.items[0]!
    const remote = new ScriptedWorkspaceRemote([{
      frames: [
        opening,
        { type: 'upsert', workspace },
        { type: 'remove', workspaceId: workspace.workspaceId },
        { type: 'order', workspaceIds: [workspace.workspaceId] },
        { type: 'archived', archivedSessionIds: ['session-one' as never] },
        { type: 'pinned', pinnedSessionIds: [sid('session-two')] },
      ],
      hold: true,
    }])
    const replaceBaseline = vi.fn<WorkspaceFollowSink['replaceBaseline']>()
    const upsertView = vi.fn<WorkspaceFollowSink['upsertView']>()
    const removeView = vi.fn<WorkspaceFollowSink['removeView']>()
    const replaceOrder = vi.fn<WorkspaceFollowSink['replaceOrder']>()
    const replaceArchived = vi.fn<WorkspaceFollowSink['replaceArchived']>()
    const replacePinned = vi.fn<WorkspaceFollowSink['replacePinned']>()
    const accept = accepts({
      replaceBaseline,
      upsertView,
      removeView,
      replaceOrder,
      replaceArchived,
      replacePinned,
    })
    const stream = createWorkspaceStateStream(workspaceClient(remote), {
      accept,
      failed: vi.fn(),
    })

    stream.start()
    stream.start()
    await vi.waitFor(() => { expect(replacePinned).toHaveBeenCalledOnce() })

    expect(replaceBaseline).toHaveBeenCalledWith(opening.value)
    expect(upsertView).toHaveBeenCalledWith(workspace)
    expect(removeView).toHaveBeenCalledWith(workspace.workspaceId)
    expect(replaceOrder).toHaveBeenCalledWith([workspace.workspaceId])
    expect(replaceArchived).toHaveBeenCalledWith(['session-one'])
    expect(replacePinned).toHaveBeenCalledWith(['session-two'])
    await stream.dispose()
    expect(remote.signals[0]?.aborted).toBe(true)
  })

  it('retains the old state across carrier loss and applies the replacement baseline', async () => {
    const carrier = new RemoteStreamCarrierError('socket lost')
    const remote = new ScriptedWorkspaceRemote([
      { frames: [baseline('old')], error: carrier },
      { frames: [baseline('fresh')], hold: true },
    ])
    const replaceBaseline = vi.fn<WorkspaceFollowSink['replaceBaseline']>()
    const carrierFailed = vi.fn()
    const failed = vi.fn()
    const stream = createWorkspaceStateStream(workspaceClient(remote), {
      accept: accepts({ replaceBaseline }),
      carrierFailed,
      failed,
    })

    stream.start()
    await vi.waitFor(() => { expect(replaceBaseline).toHaveBeenCalledTimes(2) })

    expect(replaceBaseline.mock.calls.map(([value]) => value.items[0]?.title)).toEqual(['old', 'fresh'])
    expect(carrierFailed).toHaveBeenCalledWith(carrier)
    expect(failed).not.toHaveBeenCalled()
    await stream.dispose()
  })

  it('classifies a normal end after the opening baseline as carrier loss', async () => {
    const remote = new ScriptedWorkspaceRemote([
      { frames: [baseline('old')] },
      { frames: [baseline('fresh')], hold: true },
    ])
    const replaceBaseline = vi.fn<WorkspaceFollowSink['replaceBaseline']>()
    const carrierFailed = vi.fn()
    const stream = createWorkspaceStateStream(workspaceClient(remote), {
      accept: accepts({ replaceBaseline }),
      carrierFailed,
      failed: vi.fn(),
    })

    stream.start()
    await vi.waitFor(() => { expect(replaceBaseline).toHaveBeenCalledTimes(2) })
    expect(carrierFailed.mock.calls[0]?.[0]).toMatchObject({
      message: 'Workspace state stream ended without a terminal result',
    })
    await stream.dispose()
  })

  it('suppresses callback failure after disposal begins', async () => {
    const failed = vi.fn()
    let closing: Promise<void> | undefined
    const stream = createWorkspaceStateStream(
      workspaceClient(new ScriptedWorkspaceRemote([{ frames: [baseline()] }])),
      {
        accept: accepts({
          replaceBaseline: () => {
            closing = stream.dispose()
            throw new Error('disposed callback')
          },
        }),
        failed,
      },
    )

    stream.start()
    await vi.waitFor(() => { expect(closing).toBeDefined() })
    await closing
    expect(failed).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'an increment before the baseline',
      frames: [{ type: 'remove', workspaceId: 'one' as never }] as WorkspaceFollowFrame[],
      message: 'update before its opening snapshot',
    },
    {
      name: 'a duplicate baseline',
      frames: [baseline(), baseline()] as WorkspaceFollowFrame[],
      message: 'more than one opening snapshot',
    },
    {
      name: 'a normal end before the baseline',
      frames: [] as WorkspaceFollowFrame[],
      message: 'ended before its opening snapshot',
    },
  ])('reports $name as a terminal failure', async ({ frames, message }) => {
    const failed = vi.fn()
    const stream = createWorkspaceStateStream(
      workspaceClient(new ScriptedWorkspaceRemote([{ frames }])),
      { accept: accepts(), failed },
    )

    stream.start()
    await vi.waitFor(() => { expect(failed).toHaveBeenCalledOnce() })
    const failure: unknown = failed.mock.calls[0]?.[0]
    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) throw new Error('expected Workspace stream failure')
    expect(failure.message).toContain(message)
    await stream.dispose()
  })

  it('restarts a live generation without reporting cancellation as failure', async () => {
    const remote = new ScriptedWorkspaceRemote([
      { frames: [baseline('first')], hold: true },
      { frames: [baseline('second')], hold: true },
    ])
    const replaceBaseline = vi.fn<WorkspaceFollowSink['replaceBaseline']>()
    const failed = vi.fn()
    const stream = createWorkspaceStateStream(workspaceClient(remote), {
      accept: accepts({ replaceBaseline }),
      failed,
    })

    stream.start()
    await vi.waitFor(() => { expect(replaceBaseline).toHaveBeenCalledOnce() })
    stream.restart()
    await vi.waitFor(() => { expect(replaceBaseline).toHaveBeenCalledTimes(2) })
    expect(failed).not.toHaveBeenCalled()
    await stream.dispose()
  })
})

describe('WorkspaceController', () => {
  it('returns no Workspace when startup is ineligible without changing the list', async () => {
    const remote = new CommandWorkspaceRemote()
    const model = new ClientWorkspaceModel(remote)
    model.replaceBaseline({ items: [], archivedSessionIds: [], pinnedSessionIds: [] })
    const controller = new WorkspaceController(new Context(), model)
    const before = model.getSnapshot()
    remote.initializeDefault.mockResolvedValueOnce(remoteOk(undefined))
    await expect(controller.initializeDefault({ directoryName: 'Default workspace', title: 'Default workspace' }))
      .resolves.toBeUndefined()
    expect(model.getSnapshot()).toBe(before)
  })

  it('publishes the model source and exposes successful Workspace commands', async () => {
    const remote = new CommandWorkspaceRemote()
    const model = new ClientWorkspaceModel(remote)
    model.replaceBaseline({ items: [workspace('one')], archivedSessionIds: [], pinnedSessionIds: [] })
    const controller = new WorkspaceController(new Context(), model)

    expect(controller.list).toBe(model)
    await expect(controller.initializeDefault({ directoryName: '默认工作区', title: '默认工作区' }, new AbortController().signal)).resolves.toMatchObject({ workspaceId: 'default' })
    await expect(controller.create({ path: '/work/created' })).resolves.toMatchObject({ workspaceId: 'created' })
    await expect(controller.rename(wid('one'), 'renamed')).resolves.toMatchObject({ title: 'renamed' })
    await expect(controller.insertBefore(wid('one'))).resolves.toBeUndefined()
    await expect(controller.insertSessionBefore(wid('one'), sid('session'))).resolves.toMatchObject({
      sessionIds: ['session'],
    })
    await expect(controller.archiveSession(sid('session'))).resolves.toBeUndefined()
    await expect(controller.unarchiveSession(sid('session'))).resolves.toBeUndefined()
    await expect(controller.pinSession(sid('session'))).resolves.toBeUndefined()
    await expect(controller.unpinSession(sid('session'))).resolves.toBeUndefined()
    await expect(controller.delete(wid('one'))).resolves.toBeUndefined()
    // Each command crosses the wire as one positional request object.
    expect(remote.initializeDefault)
      .toHaveBeenCalledWith({ directoryName: '默认工作区', title: '默认工作区' }, expect.any(AbortSignal))
    expect(remote.create).toHaveBeenCalledWith({ path: '/work/created' })
    expect(remote.rename).toHaveBeenCalledWith({ workspaceId: 'one', title: 'renamed' })
    expect(remote.insertBefore).toHaveBeenCalledWith({ workspaceId: 'one' })
    expect(remote.insertSessionBefore).toHaveBeenCalledWith({ workspaceId: 'one', sessionId: 'session' })
    await expect(controller.archiveSession(sid('session'), { stopActivity: true })).resolves.toBeUndefined()
    expect(remote.archiveSession.mock.calls.map(([request]) => request))
      .toEqual([{ sessionId: 'session' }, { sessionId: 'session', stopActivity: true }])
    expect(remote.unarchiveSession).toHaveBeenCalledWith({ sessionId: 'session' })
    expect(remote.pinSession).toHaveBeenCalledWith({ sessionId: 'session' })
    expect(remote.unpinSession).toHaveBeenCalledWith({ sessionId: 'session' })
    expect(remote.delete).toHaveBeenCalledWith({ workspaceId: 'one' })
  })

  it('maps generated business failures to the command facade errors', async () => {
    const remote = new CommandWorkspaceRemote()
    const controller = new WorkspaceController(new Context(), new ClientWorkspaceModel(remote))
    const missingWorkspace = new RemoteError('workspace/not-found', 'gone', { workspaceId: wid('missing') })
    const missingSession = new RemoteError('session/not-found', 'missing session', { sessionId: sid('session') })

    remote.initializeDefault.mockResolvedValueOnce(remoteFailure(new RemoteError('gateway/internal', 'directory denied', {})))
    await expect(controller.initializeDefault({ directoryName: 'Default workspace', title: 'Default workspace' })).rejects.toBeInstanceOf(WorkspaceCreateError)

    remote.create.mockResolvedValueOnce(remoteFailure(new RemoteError('workspace/invalid-path', 'missing path', { path: '/missing' })))
    const create = controller.create({ path: '/missing' })
    await expect(create).rejects.toBeInstanceOf(WorkspaceCreateError)
    await expect(create).rejects.toThrow('workspace/invalid-path: missing path')

    remote.rename.mockResolvedValueOnce(remoteFailure(missingWorkspace))
    await expect(controller.rename(wid('missing'), 'name')).rejects.toThrow('workspace rename failed: workspace/not-found: gone')
    remote.delete.mockResolvedValueOnce(remoteFailure(missingWorkspace))
    await expect(controller.delete(wid('missing'))).rejects.toThrow('workspace delete failed: workspace/not-found: gone')
    remote.insertBefore.mockResolvedValueOnce(remoteFailure(missingWorkspace))
    await expect(controller.insertBefore(wid('missing'))).rejects.toThrow('workspace reorder failed: workspace/not-found: gone')
    remote.archiveSession.mockResolvedValueOnce(remoteFailure(missingSession))
    const archiveMissing = controller.archiveSession(sid('session'))
    await expect(archiveMissing).rejects.toBeInstanceOf(WorkspaceArchiveError)
    await expect(archiveMissing).rejects.toThrow('workspace session archive failed: session/not-found: missing session')
    // The active-session refusal keeps its structured details so a surface
    // can name what still runs.
    const active = new RemoteError('workspace/session-active', 'session is active', {
      sessionId: sid('session'), activity: [{ kind: 'probe' }, { kind: 'probe-items', items: [{ id: 'item-1' }] }],
    })
    remote.archiveSession.mockResolvedValueOnce(remoteFailure(active))
    await expect(controller.archiveSession(sid('session'))).rejects.toMatchObject({
      name: 'WorkspaceArchiveError',
      rpcError: { code: 'workspace/session-active', details: { activity: [{ kind: 'probe' }, { kind: 'probe-items', items: [{ id: 'item-1' }] }] } },
    })
    remote.unarchiveSession.mockResolvedValueOnce(remoteFailure(missingSession))
    await expect(controller.unarchiveSession(sid('session')))
      .rejects.toThrow('workspace session unarchive failed: session/not-found: missing session')
    remote.pinSession.mockResolvedValueOnce(remoteFailure(missingSession))
    await expect(controller.pinSession(sid('session')))
      .rejects.toThrow('workspace session pin failed: session/not-found: missing session')
    remote.unpinSession.mockResolvedValueOnce(remoteFailure(missingSession))
    await expect(controller.unpinSession(sid('session')))
      .rejects.toThrow('workspace session unpin failed: session/not-found: missing session')
    remote.insertSessionBefore.mockResolvedValueOnce(remoteFailure(new RemoteError(
      'workspace/move-invalid', 'invalid move', { workspaceId: wid('missing'), sessionId: sid('session') },
    )))
    await expect(controller.insertSessionBefore(wid('missing'), sid('session')))
      .rejects.toThrow('workspace move failed: workspace/move-invalid: invalid move')
  })
})

// The wire relays whatever families the Host's providers report; this suite merges its own.
declare module '@deepseek-ai/dsh-workspace/types' {
  interface SessionActivityKindMap {
    probe: true
    'probe-items': true
  }
}
