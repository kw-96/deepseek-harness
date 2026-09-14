/**
 * 针对真实 SlotCore 的加载期回归覆盖：先播种宿主外壳的槽位树（底栏行与会话
 * 头工具区），再让 dsh-codex-shell 客户端 apply 注册进宿主洞口。
 *
 * 同时验证拆分后的边界：本插件不再注册任何侧栏槽位，因此即使槽位树里没有
 * sidebar.* 声明，apply 也必须完整成功（左侧面属于 dsh-codex-left）。
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

/** 声明并占用宿主外壳组合，与真实装配一致。 */
function seedShippedComposition(core: SlotCore): void {
  const declare = (parent: string, entry: StubOptions): void => {
    core.register(entry as never, dummy)
  }
  declare('root', { name: 'root', children: {
    'bottom': { kind: 'single', scope: 'session' },
    'conversation': { kind: 'single', scope: 'session-maybe' },
  } })
  // 原生底栏内容占据该行（本插件以 priority -1 遮蔽）。
  declare('bottom', { name: 'bottom', priority: 0 })
  declare('conversation', { name: 'conversation', children: {
    'conversation.session': { kind: 'single', scope: 'session' },
  } })
  declare('conversation.session', { name: 'conversation.session', children: {
    'conversation.session.header': { kind: 'single', scope: 'session' },
  } })
  declare('conversation.session.header', { name: 'conversation.session.header', children: {
    'conversation.session.header.lineage': { kind: 'single', scope: 'session' },
    'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
  } })
}

/** 客户端 apply 使用的最小 SlotRegistry 包装。 */
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
        'remote.codexShell': codexShell,
        layout: { openBottom: () => {}, closeBottom: () => {} },
      }
      return services[name]
    },
    effect: (_setup: () => unknown, _label?: string) => noop(),
    on: () => noop(),
  }
}

describe('codex-shell registration against the real SlotCore', () => {
  it('占用底栏行并注册会话头终端按钮，不触碰侧栏槽位', async () => {
    const core = new SlotCore()
    seedShippedComposition(core)
    const disposer = await apply(fakeCtx(core) as never)
    expect(typeof disposer).toBe('function')

    const bottomWinners = core.entriesOfSlot('bottom')
    expect(bottomWinners).toHaveLength(1)
    expect(bottomWinners[0]?.component).not.toBe(dummy)
    expect(bottomWinners[0]?.options.priority).toBe(-1)

    const utilities = core.entries('conversation.session.header.utilities')
    expect(utilities.some(entry => entry.options.id === 'codex-panel-toggle')).toBe(true)

    disposer()
  })

  it('卸载后注销底栏与会话头贡献', async () => {
    const core = new SlotCore()
    seedShippedComposition(core)
    const disposer = await apply(fakeCtx(core) as never)
    await disposer()
    expect(core.entries('conversation.session.header.utilities')).toHaveLength(0)
    expect(core.entriesOfSlot('bottom')).toHaveLength(1)
    expect(core.entriesOfSlot('bottom')[0]?.component).toBe(dummy)
  })
})
