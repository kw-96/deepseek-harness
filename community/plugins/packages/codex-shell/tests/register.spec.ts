/**
 * Load-time regression coverage against the REAL SlotCore: the shipped shell
 * declares the sidebar/conversation/settings tree, then the codex-shell
 * client apply registers into the shipped holes. A duplicate child
 * declaration (e.g. re-declaring sidebar.workspaces.directoryFlow while the
 * native browser still owns it) throws here instead of silently in the
 * browser.
 */
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.js'

const noop = (): (() => void) => () => {}
const dummy = (): null => null

interface StubOptions {
  name: string
  id?: string
  order?: number
  priority?: number
  children?: Record<string, { kind: 'single' | 'list'; scope: 'root' | 'session' | 'session-maybe' }>
}

/** Declare + occupy the shipped composition the way the harness shell does. */
function seedShippedComposition(core: SlotCore): void {
  const declare = (parent: string, entry: StubOptions): void => {
    core.register(entry as never, dummy)
  }
  declare('root', { name: 'root', children: {
    'sidebar': { kind: 'single', scope: 'root' },
    'conversation': { kind: 'single', scope: 'session-maybe' },
    'details': { kind: 'single', scope: 'session' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  } })
  declare('sidebar', { name: 'sidebar', children: {
    'sidebar.brand.mark': { kind: 'single', scope: 'root' },
    'sidebar.brand.name': { kind: 'single', scope: 'root' },
    'sidebar.workspaces': { kind: 'single', scope: 'root' },
    'sidebar.settings': { kind: 'single', scope: 'root' },
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
  } })
  // The shipped WorkspaceBrowser occupies the browser hole and declares the
  // directory-flow child — exactly what runs in the real composition.
  declare('sidebar.workspaces', {
    name: 'sidebar.workspaces',
    priority: 0,
    children: { 'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' } },
  })
  declare('conversation', { name: 'conversation', children: {
    'conversation.session': { kind: 'single', scope: 'session' },
  } })
  declare('conversation.session', { name: 'conversation.session', children: {
    'conversation.session.header': { kind: 'single', scope: 'session' },
    'conversation.view': { kind: 'list', scope: 'session' },
  } })
  declare('conversation.session.header', { name: 'conversation.session.header', children: {
    'conversation.session.header.lineage': { kind: 'single', scope: 'session' },
    'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
  } })
}

/** Minimal SlotRegistry-like wrapper over the real core for the client apply. */
function slotsFace(core: SlotCore): {
  inject: (key: string, cb: () => (() => void) | void) => () => void
  register: typeof core.register
  entries: (key: string) => readonly unknown[]
  subscribe: (key: string, listener: () => void) => () => void
} {
  return {
    inject: (key, cb) => {
      if (core.specDynamic(key) !== undefined) {
        const disposal = cb()
        return disposal === undefined ? noop() : disposal
      }
      return core.subscribeDeclaration(key, () => {
        if (core.specDynamic(key) !== undefined) cb()
      })
    },
    register: (options, component) => core.register(options as never, component),
    entries: key => core.entries(key),
    subscribe: (key, listener) => core.subscribe(key, listener),
  }
}

function fakeCtx(core: SlotCore): unknown {
  const codexShell = new Proxy({}, {
    get: () => async () => ({ ok: true, value: {} }),
  })
  return {
    get(name: string): unknown {
      const services: Record<string, unknown> = {
        slots: slotsFace(core),
        locale: { register: () => noop(), bind: () => (key: string) => key },
        remote: { $mount: async () => noop(), codexShell, $host: {} },
        sessions: {
          create: async () => 'session-x', open: () => {}, search: async () => ({ ok: true, value: { items: [], hasMore: false } }),
          searchResultLimit: 10, binding: () => undefined, fork: async () => 'session-y',
        },
        workspaces: {
          rename: async () => {}, delete: async () => {}, insertBefore: async () => {}, archiveSession: async () => {},
          insertSessionBefore: async () => {}, create: async () => ({}),
        },
        connection: { api: { sessions: { history: async () => ({ ok: true, value: { records: [] } }) } } },
      }
      return services[name]
    },
    effect: (_setup: () => unknown, _label?: string) => noop(),
    on: () => noop(),
  }
}

describe('codex-shell registration against the real SlotCore', () => {
  it('shadows the shipped browser and adds the panel/toggle entries without throwing', async () => {
    const core = new SlotCore()
    seedShippedComposition(core)
    const disposer = await apply(fakeCtx(core) as never)
    expect(typeof disposer).toBe('function')

    const browserWinners = core.entriesOfSlot('sidebar.workspaces')
    expect(browserWinners).toHaveLength(1)
    expect(browserWinners[0]?.component).not.toBe(dummy)
    expect(browserWinners[0]?.options.priority).toBe(-1)

    expect(core.entries('shell.overlay').some(entry => entry.options.id === 'codex-panel')).toBe(true)
    expect(core.entries('conversation.session.header.utilities').some(entry => entry.options.id === 'codex-panel-toggle')).toBe(true)

    disposer()
  })

  it('does not redeclare the shipped directory-flow hole (the regression)', async () => {
    const core = new SlotCore()
    seedShippedComposition(core)
    // The shipped declaration must survive the shadowing registration.
    await apply(fakeCtx(core) as never)
    expect(core.specDynamic('sidebar.workspaces.directoryFlow')).toBeDefined()
  })
})
