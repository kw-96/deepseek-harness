// @vitest-environment jsdom
/**
 * 桌面壳托盘对接 spec：工作区与文案下发给壳的 `set_desktop_tray` 命令，托盘命令
 * 回写为页面导航；浏览器标签页（无 Tauri 全局对象）不做任何事。壳侧的
 * 菜单与进程生命周期不在浏览器测试范围内。
 */
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installDesktopTray, onTrayOpenWorkspace, quitDesktopApp, syncDesktopTray,
  type DesktopTrayLabels, type TrayWorkspaceEntry,
} from '../src/client/desktop/tray.ts'

/** 复制的壳 IPC 假面：记录命令、可手动派发窗口事件。 */
type TauriStub = {
  invoke: ReturnType<typeof vi.fn>
  listen: ReturnType<typeof vi.fn>
  unlisten: ReturnType<typeof vi.fn>
  /** 派发一次窗口事件给已注册的监听器。 */
  emit(name: string, payload: unknown): void
}

/** 安装 withGlobalTauri 假面。 */
function installTauri(): TauriStub {
  const invoke = vi.fn(async () => undefined)
  const unlisten = vi.fn()
  const handlers = new Map<string, Set<(event: { payload: unknown }) => void>>()
  const listen = vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    const set = handlers.get(name) ?? new Set<(event: { payload: unknown }) => void>()
    set.add(handler)
    handlers.set(name, set)
    return () => {
      set.delete(handler)
      unlisten()
    }
  })
  ;(window as unknown as { __TAURI__: unknown }).__TAURI__ = { core: { invoke }, event: { listen } }
  return {
    invoke,
    listen,
    unlisten,
    emit(name, payload) {
      for (const handler of [...(handlers.get(name) ?? [])]) handler({ payload })
    },
  }
}

const LABELS: DesktopTrayLabels = { show: 'Show', quit: 'Quit', empty: 'None' }
const ENTRIES: readonly TrayWorkspaceEntry[] = [{ id: 'ws-1', title: 'Alpha' }]

/** 读取 Tauri 假面（未安装时 undefined）。 */
function tauriGlobal(): unknown {
  return (window as unknown as { __TAURI__?: unknown }).__TAURI__
}

/** 最近一次 set_desktop_tray 的 spec 参数。 */
function lastSpec(invoke: TauriStub['invoke']): unknown {
  const call = invoke.mock.calls.at(-1)
  return (call?.[1] as { spec?: unknown } | undefined)?.spec
}

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__
  vi.restoreAllMocks()
})

describe('syncDesktopTray', () => {
  it('does nothing outside the desktop shell', () => {
    syncDesktopTray(ENTRIES, LABELS)
    expect(tauriGlobal()).toBeUndefined()
  })

  it('hands the workspaces and labels to the shell command', () => {
    const tauri = installTauri()
    syncDesktopTray(ENTRIES, LABELS)
    expect(tauri.invoke).toHaveBeenCalledWith('set_desktop_tray', {
      spec: {
        workspaces: [{ id: 'ws-1', title: 'Alpha' }],
        showLabel: 'Show',
        quitLabel: 'Quit',
        emptyLabel: 'None',
      },
    })
  })

  it('keeps the previous menu when the shell rejects the update', async () => {
    const tauri = installTauri()
    tauri.invoke.mockRejectedValueOnce(new Error('no tray'))
    syncDesktopTray([], LABELS)
    await vi.waitFor(() => { expect(tauri.invoke).toHaveBeenCalledOnce() })
  })
})

describe('quitDesktopApp', () => {
  it('does nothing outside the desktop shell', () => {
    quitDesktopApp()
    expect(tauriGlobal()).toBeUndefined()
  })

  it('asks the shell to end the app', () => {
    const tauri = installTauri()
    quitDesktopApp()
    expect(tauri.invoke).toHaveBeenCalledWith('quit_desktop_app')
  })

  it('leaves the window untouched when the command fails', async () => {
    const tauri = installTauri()
    tauri.invoke.mockRejectedValueOnce(new Error('no command'))
    quitDesktopApp()
    await vi.waitFor(() => { expect(tauri.invoke).toHaveBeenCalledOnce() })
  })
})

describe('onTrayOpenWorkspace', () => {
  it('returns an inert disposer outside the desktop shell', () => {
    const handler = vi.fn()
    const dispose = onTrayOpenWorkspace(handler)
    dispose()
    expect(handler).not.toHaveBeenCalled()
  })

  it('forwards a workspace id and ignores every other payload', async () => {
    const tauri = installTauri()
    const handler = vi.fn()
    onTrayOpenWorkspace(handler)
    await vi.waitFor(() => { expect(tauri.listen).toHaveBeenCalledOnce() })
    tauri.emit('tray-open-workspace', 'ws-9')
    tauri.emit('tray-open-workspace', '')
    tauri.emit('tray-open-workspace', null)
    expect(handler).toHaveBeenCalledExactlyOnceWith('ws-9')
  })

  it('unlistens when the subscription settles after teardown', async () => {
    const tauri = installTauri()
    const dispose = onTrayOpenWorkspace(vi.fn())
    dispose()
    await vi.waitFor(() => { expect(tauri.unlisten).toHaveBeenCalledOnce() })
  })

  it('stops forwarding after teardown', async () => {
    const tauri = installTauri()
    const handler = vi.fn()
    const dispose = onTrayOpenWorkspace(handler)
    await vi.waitFor(() => { expect(tauri.listen).toHaveBeenCalledOnce() })
    dispose()
    tauri.emit('tray-open-workspace', 'ws-9')
    expect(handler).not.toHaveBeenCalled()
  })

  it('stays inert when the shell refuses the subscription', async () => {
    const tauri = installTauri()
    tauri.listen.mockRejectedValueOnce(new Error('event bus down'))
    onTrayOpenWorkspace(vi.fn())
    await vi.waitFor(() => { expect(tauri.listen).toHaveBeenCalledOnce() })
  })
})

/** 托盘装配的测试台：真实 locale 服务 + 假工作区与导航服务。 */
function bench(options: { workspaces?: boolean; navigation?: boolean } = {}) {
  const tauri = installTauri()
  const ctx = new Context()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  // 只覆盖托盘用到的三条键：类型化的 register 要求整份 common 字典，
  // 这里按测试替身处理。
  locale.register('common', {
    en: {
      'desktop.tray.showWindow': 'Show Window',
      'desktop.menu.quit': 'Quit DeepSeek Harness',
      'desktop.tray.noWorkspace': 'No Workspaces',
    },
  } as never)

  let items: readonly { workspaceId: string; title: string }[] = []
  const listeners = new Set<() => void>()
  if (options.workspaces !== false) {
    ctx.provide('workspaces', {
      list: {
        getSnapshot: () => ({ items }),
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      },
    } as never)
  }
  const openWorkspace = vi.fn(async () => {})
  if (options.navigation !== false) ctx.provide('uiWorkspace', { openWorkspace } as never)

  const dispose = installDesktopTray(ctx)
  return {
    ctx,
    tauri,
    openWorkspace,
    dispose,
    /** 已订阅工作区列表的监听器数量（等异步 inject 分支就绪用）。 */
    listenerCount: () => listeners.size,
    /** 换一份工作区列表并通知订阅者。 */
    setItems(next: readonly { workspaceId: string; title: string }[]) {
      items = next
      for (const listener of [...listeners]) listener()
    },
  }
}

describe('installDesktopTray', () => {
  it('publishes the localized menu with the current workspaces', async () => {
    const b = bench()
    await vi.waitFor(() => { expect(b.listenerCount()).toBe(1) })
    expect(lastSpec(b.tauri.invoke)).toEqual({
      workspaces: [],
      showLabel: 'Show Window',
      quitLabel: 'Quit DeepSeek Harness',
      emptyLabel: 'No Workspaces',
    })
    b.setItems([{ workspaceId: 'ws-1', title: 'Alpha' }])
    expect(lastSpec(b.tauri.invoke)).toMatchObject({ workspaces: [{ id: 'ws-1', title: 'Alpha' }] })
    b.dispose()
  })

  it('publishes an empty menu when no workspace service is composed', async () => {
    const b = bench({ workspaces: false })
    await vi.waitFor(() => { expect(b.tauri.invoke).toHaveBeenCalledOnce() })
    expect(lastSpec(b.tauri.invoke)).toMatchObject({ workspaces: [] })
    b.dispose()
  })

  it('rebuilds the menu when the language changes', async () => {
    const b = bench()
    await vi.waitFor(() => { expect(b.tauri.invoke).toHaveBeenCalled() })
    const before = b.tauri.invoke.mock.calls.length
    b.ctx.emit('locale/change', b.ctx.locale.getSnapshot())
    expect(b.tauri.invoke.mock.calls.length).toBeGreaterThan(before)
    b.dispose()
  })

  it('opens the workspace a tray row points at', async () => {
    const b = bench()
    await vi.waitFor(() => { expect(b.tauri.listen).toHaveBeenCalledOnce() })
    b.tauri.emit('tray-open-workspace', 'ws-7')
    expect(b.openWorkspace).toHaveBeenCalledExactlyOnceWith('ws-7')
    b.dispose()
  })

  it('ignores a tray row when the navigation service is absent', async () => {
    const b = bench({ navigation: false })
    await vi.waitFor(() => { expect(b.tauri.listen).toHaveBeenCalledOnce() })
    expect(() => { b.tauri.emit('tray-open-workspace', 'ws-7') }).not.toThrow()
    b.dispose()
  })

  it('keeps the current session when opening a workspace fails', async () => {
    const b = bench()
    await vi.waitFor(() => { expect(b.tauri.listen).toHaveBeenCalledOnce() })
    b.openWorkspace.mockRejectedValueOnce(new Error('offline'))
    b.tauri.emit('tray-open-workspace', 'ws-7')
    await vi.waitFor(() => { expect(b.openWorkspace).toHaveBeenCalledOnce() })
    b.dispose()
  })

  it('unwinds the locale and tray subscriptions on teardown', async () => {
    const b = bench()
    await vi.waitFor(() => { expect(b.listenerCount()).toBe(1) })
    b.dispose()
    // inject fiber 的释放是异步契约：等订阅真正摘掉再验证不再重建菜单。
    await vi.waitFor(() => { expect(b.listenerCount()).toBe(0) })
    const after = b.tauri.invoke.mock.calls.length
    b.setItems([{ workspaceId: 'ws-2', title: 'Beta' }])
    b.ctx.emit('locale/change', b.ctx.locale.getSnapshot())
    expect(b.tauri.invoke.mock.calls.length).toBe(after)
  })
})
