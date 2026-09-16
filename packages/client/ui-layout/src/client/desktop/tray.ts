/**
 * 桌面壳托盘对接：把工作区与本地化文案下发给原生托盘，并把托盘的
 * 「进入工作区」命令转成页面导航。浏览器打开同一页面时全部退化为空操作。
 *
 * 托盘本体由 `src-tauri/src/tray.rs` 持有；本模块只负责 IPC 与装配接线。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { isDesktopShell } from './detect.ts'

/** 托盘「进入工作区」事件名，与 `src-tauri/src/tray.rs` 保持一致。 */
const TRAY_OPEN_WORKSPACE = 'tray-open-workspace'

/** 托盘菜单里的一个工作区条目。 */
export type TrayWorkspaceEntry = {
  /** 页面侧持有的工作区 id。 */
  readonly id: string
  /** 菜单显示名。 */
  readonly title: string
}

/** 托盘菜单文案（本地化后下发）。 */
export type DesktopTrayLabels = {
  /** 恢复主窗口。 */
  readonly show: string
  /** 退出 DSH。 */
  readonly quit: string
  /** 无工作区时的占位行。 */
  readonly empty: string
}

/**
 * 托盘需要的工作区投影：只读列表加订阅。用结构类型描述，避免为托盘把
 * workspace-controller 拉进本包的类型依赖。
 */
type TrayWorkspaceSource = {
  readonly list: {
    getSnapshot(): { readonly items: readonly { readonly workspaceId: string; readonly title: string }[] }
    subscribe(listener: () => void): () => void
  }
}

/** ui-workspace 提供的可选导航面（`ctx.uiWorkspace`）。 */
type TrayWorkspaceNavigation = {
  openWorkspace(workspaceId: string): Promise<void>
}

/** `withGlobalTauri` 注入面中托盘用到的最小集合。 */
type DesktopIpc = {
  core?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> }
  event?: {
    listen?: (
      name: string,
      handler: (event: { payload: unknown }) => void,
    ) => Promise<() => void>
  }
}

/** 读取 Tauri IPC 面；浏览器中返回 undefined。 */
function desktopIpc(): DesktopIpc | undefined {
  if (!isDesktopShell()) return undefined
  return (window as Window & { __TAURI__?: DesktopIpc }).__TAURI__
}

/**
 * 把工作区列表与菜单文案下发给原生托盘。
 * @param workspaces - 当前工作区，按菜单显示顺序排列。
 * @param labels - 本地化后的菜单文案。
 */
export function syncDesktopTray(
  workspaces: readonly TrayWorkspaceEntry[],
  labels: DesktopTrayLabels,
): void {
  const invoke = desktopIpc()?.core?.invoke
  if (invoke === undefined) return
  void invoke('set_desktop_tray', {
    spec: {
      workspaces: workspaces.map(workspace => ({ id: workspace.id, title: workspace.title })),
      showLabel: labels.show,
      quitLabel: labels.quit,
      emptyLabel: labels.empty,
    },
  }).catch(() => {
    // 托盘不可用时保留上一次的菜单，桌面其余部分不受影响。
  })
}

/**
 * 订阅托盘菜单的「进入工作区」命令。
 * @param handler - 收到工作区 id 时调用。
 * @returns 取消订阅的清理函数。
 */
export function onTrayOpenWorkspace(handler: (workspaceId: string) => void): () => void {
  const listen = desktopIpc()?.event?.listen
  if (listen === undefined) return () => {}
  let dispose: (() => void) | undefined
  let cancelled = false
  void listen(TRAY_OPEN_WORKSPACE, (event) => {
    const payload = event.payload
    if (typeof payload === 'string' && payload !== '') handler(payload)
  }).then((unlisten) => {
    if (cancelled) unlisten()
    else dispose = unlisten
  }).catch(() => {
    // 订阅被拒绝时托盘命令静默不可用，不影响窗口与页面其余部分。
  })
  return () => {
    cancelled = true
    dispose?.()
  }
}

/**
 * 真正退出 DSH：结束 `dsh web` 子进程并关闭外壳。
 */
export function quitDesktopApp(): void {
  const invoke = desktopIpc()?.core?.invoke
  if (invoke === undefined) return
  void invoke('quit_desktop_app').catch(() => {
    // 退出命令失败时保持窗口不动，由用户从托盘菜单重试。
  })
}

/**
 * 装配托盘的运行期接线：前端就绪即下发本地化菜单，工作区列表变化与语言切换
 * 都会重建菜单，托盘命令则转成页面导航。
 * @param ctx - client 根上下文（apply 世界）。
 * @returns 释放本次接线的清理函数。
 */
export function installDesktopTray(ctx: ClientContext): () => void {
  const t = ctx.locale.bind('common')
  let entries: readonly TrayWorkspaceEntry[] = []
  const pushMenu = (): void => {
    syncDesktopTray(entries, {
      show: t('desktop.tray.showWindow'),
      quit: t('desktop.menu.quit'),
      empty: t('desktop.tray.noWorkspace'),
    })
  }
  /** 读取当前工作区并重建菜单；工作区服务缺席时按空列表处理。 */
  const adoptWorkspaces = (): void => {
    const source = ctx.get('workspaces') as TrayWorkspaceSource | undefined
    const items = source?.list.getSnapshot().items ?? []
    entries = items.map(item => ({ id: item.workspaceId, title: item.title }))
    pushMenu()
  }
  const offLocale = ctx.on('locale/change', pushMenu)
  const offTray = onTrayOpenWorkspace((workspaceId) => {
    // ui-workspace 是可选服务：组合里没有它时该菜单项静默无效。
    const navigation = ctx.get('uiWorkspace') as TrayWorkspaceNavigation | undefined
    if (navigation === undefined) return
    void navigation.openWorkspace(workspaceId).catch(() => {
      // 打开失败保留当前会话，用户可从左栏重试。
    })
  })
  // 工作区服务可能晚于本插件出现：就绪后再订阅它的列表。
  const workspaces = ctx.inject(['workspaces'], (scope) => {
    const source = scope.get('workspaces') as TrayWorkspaceSource
    scope.effect(() => {
      const off = source.list.subscribe(adoptWorkspaces)
      adoptWorkspaces()
      return off
    }, 'ui-layout: desktop tray workspaces')
  })
  adoptWorkspaces()
  return () => {
    offLocale()
    offTray()
    void workspaces.dispose()
  }
}
