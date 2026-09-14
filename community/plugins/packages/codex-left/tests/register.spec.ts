/**
 * 针对真实 SlotCore 的加载期回归覆盖：先播种宿主外壳的槽位树
 * （侧栏与新建会话页），再让 dsh-codex-left 客户端 apply 注册进宿主洞口。
 * 重复子槽声明（例如重复声明 sidebar.workspaces.directoryFlow）会在这里
 * 直接抛出，而不是在浏览器里静默失败。
 *
 * 同时验证：遮蔽原生浏览器后，原生条目仍持有 directoryFlow 的声明
 * （子槽不随优先级落选而坍塌）。
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
  declare('conversation', { name: 'conversation', children: {
    'conversation.hero': { kind: 'single', scope: 'root' },
    'conversation.session': { kind: 'single', scope: 'session' },
  } })
  // 原生工作区选择器占据新建会话页洞口。
  declare('conversation.hero', { name: 'conversation.hero', children: {
    'conversation.hero.workspace': { kind: 'single', scope: 'root' },
  } })
  declare('conversation.hero.workspace', { name: 'conversation.hero.workspace', priority: 0 })
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
  const codexLeft = new Proxy({}, {
    get: () => async () => ({ ok: true, value: {} }),
  })
  return {
    get(name: string): unknown {
      const services: Record<string, unknown> = {
        slots: slotsFace(core),
        locale: { register: () => noop(), bind: () => (key: string) => key },
        remote: { $mount: async () => noop(), codexLeft, $host: {} },
        'remote.codexLeft': codexLeft,
        'remote.session': { openWorkspacePath: async () => ({ ok: true }) },
        sessions: {
          create: async () => 'session-x', open: () => {}, search: async () => ({ ok: true, value: { items: [], hasMore: false } }),
          searchResultLimit: 10, binding: () => undefined, fork: async () => 'session-y',
        },
        workspaces: {
          rename: async () => {}, delete: async () => {}, insertBefore: async () => {}, archiveSession: async () => {},
          unarchiveSession: async () => {},
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

describe('codex-left registration against the real SlotCore', () => {
  it('遮蔽原生浏览器与原生项目选择器，并接管侧栏外壳槽位', async () => {
    const core = new SlotCore()
    seedShippedComposition(core)
    const disposer = await apply(fakeCtx(core) as never)
    expect(typeof disposer).toBe('function')

    const browserWinners = core.entriesOfSlot('sidebar.workspaces')
    expect(browserWinners).toHaveLength(1)
    expect(browserWinners[0]?.component).not.toBe(dummy)
    expect(browserWinners[0]?.options.priority).toBe(-1)

    const heroWinners = core.entriesOfSlot('conversation.hero.workspace')
    expect(heroWinners).toHaveLength(1)
    expect(heroWinners[0]?.component).not.toBe(dummy)
    expect(heroWinners[0]?.options.priority).toBe(-1)

    // 添加工作区弹窗挂在侧栏页脚槽位（承载弹窗与打开器，页脚无可见按钮）。
    expect(core.entries('sidebar.footer.action').some(entry => entry.options.id === 'codex-add-workspace')).toBe(true)
    // 隐藏侧栏顶部品牌文字：占用 brand.name 槽位。
    expect(core.entries('sidebar.brand.name').some(entry => entry.options.id === 'codex-hide-brand-name')).toBe(true)
    // 品牌区控制：占用 brand.mark 槽位（隐藏品牌按钮/行，轨道态渲染常显打开图标）。
    expect(core.entries('sidebar.brand.mark').some(entry => entry.options.id === 'codex-sidebar-brand-controls')).toBe(true)

    disposer()
  })

  it('遮蔽原生条目后其子槽声明保持存活（directoryFlow）', async () => {
    const core = new SlotCore()
    seedShippedComposition(core)
    await apply(fakeCtx(core) as never)
    expect(core.specDynamic('sidebar.workspaces.directoryFlow')).toBeDefined()
  })

  it('卸载后注销全部槽位贡献', async () => {
    const core = new SlotCore()
    seedShippedComposition(core)
    const disposer = await apply(fakeCtx(core) as never)
    await disposer()
    expect(core.entries('sidebar.footer.action')).toHaveLength(0)
    expect(core.entries('sidebar.brand.mark')).toHaveLength(0)
    expect(core.entriesOfSlot('sidebar.workspaces')).toHaveLength(1)
    expect(core.entriesOfSlot('sidebar.workspaces')[0]?.component).toBe(dummy)
  })
})
