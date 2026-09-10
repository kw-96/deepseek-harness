/**
 * 针对真实 SlotCore 的加载期回归覆盖：先播种宿主外壳的槽位树
 * （侧栏/会话/设置/详情列），再让 codex-shell 客户端 apply 注册进
 * 宿主洞口。重复子槽声明（例如重复声明 sidebar.workspaces.directoryFlow）
 * 会在这里直接抛出，而不是在浏览器里静默失败。
 *
 * v4 起右侧面板停靠进宿主 details 列（priority -1 遮蔽原生工具详情），
 * 本测试同时验证：遮蔽后原生条目仍持有 conversation.details.tool 的
 * 声明（子槽不随优先级落选而坍塌）。
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
  // 原生 WorkspaceBrowser 占据浏览器洞口并声明 directory-flow 子槽。
  declare('sidebar.workspaces', {
    name: 'sidebar.workspaces',
    priority: 0,
    children: { 'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' } },
  })
  // 原生 DetailsPanel 占据详情列并声明工具详情子槽。
  declare('details', {
    name: 'details',
    priority: 0,
    children: { 'conversation.details.tool': { kind: 'single', scope: 'session' } },
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
        sessions: {
          create: async () => 'session-x', open: () => {}, search: async () => ({ ok: true, value: { items: [], hasMore: false } }),
          searchResultLimit: 10, binding: () => undefined, fork: async () => 'session-y',
        },
        workspaces: {
          rename: async () => {}, delete: async () => {}, insertBefore: async () => {}, archiveSession: async () => {},
          insertSessionBefore: async () => {}, create: async () => ({}),
        },
        connection: { api: { sessions: { history: async () => ({ ok: true, value: { records: [] } }) } } },
        layout: { openBottom: () => {}, closeBottom: () => {} },
      }
      return services[name]
    },
    effect: (_setup: () => unknown, _label?: string) => noop(),
    on: () => noop(),
  }
}

describe('codex-shell registration against the real SlotCore', () => {
  it('遮蔽原生浏览器、注册头部按钮与底栏，不占用 details 列', async () => {
    const core = new SlotCore()
    seedShippedComposition(core)
    const disposer = await apply(fakeCtx(core) as never)
    expect(typeof disposer).toBe('function')

    const browserWinners = core.entriesOfSlot('sidebar.workspaces')
    expect(browserWinners).toHaveLength(1)
    expect(browserWinners[0]?.component).not.toBe(dummy)
    expect(browserWinners[0]?.options.priority).toBe(-1)

    // 右侧面板交给宿主原生 details 列：本插件不再注册该槽位，原生工具详情面板
    // 保持胜出（priority 0 的占位实现）。
    const detailsWinners = core.entriesOfSlot('details')
    expect(detailsWinners).toHaveLength(1)
    expect(detailsWinners[0]?.component).toBe(dummy)
    expect(detailsWinners[0]?.options.priority).toBe(0)
    expect(core.entries('shell.overlay').some(entry => entry.options.id === 'codex-panel')).toBe(false)
    expect(core.entries('conversation.session.header.utilities').some(entry => entry.options.id === 'codex-panel-toggle')).toBe(true)
    // 添加工作区弹窗挂在侧栏页脚槽位（承载弹窗与打开器，页脚无可见按钮）。
    expect(core.entries('sidebar.footer.action').some(entry => entry.options.id === 'codex-add-workspace')).toBe(true)
    // 隐藏侧栏顶部品牌文字：占用 brand.name 槽位。
    expect(core.entries('sidebar.brand.name').some(entry => entry.options.id === 'codex-hide-brand-name')).toBe(true)
    // 品牌区控制：占用 brand.mark 槽位（隐藏品牌按钮/行，轨道态渲染常显打开图标）。
    expect(core.entries('sidebar.brand.mark').some(entry => entry.options.id === 'codex-sidebar-brand-controls')).toBe(true)

    disposer()
  })

  it('遮蔽原生条目后其子槽声明保持存活（directoryFlow 与工具详情）', async () => {
    const core = new SlotCore()
    seedShippedComposition(core)
    await apply(fakeCtx(core) as never)
    expect(core.specDynamic('sidebar.workspaces.directoryFlow')).toBeDefined()
    expect(core.specDynamic('conversation.details.tool')).toBeDefined()
  })
})
