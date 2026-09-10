/**
 * LayoutController: the cross-plugin panel-action face behind ctx.layout.
 * Panel geometry itself lives in the root entry's layout store (stores.ts);
 * the current-session selection lives with the runtime sessions service, and
 * the per-session active view dissolved into ui-conversation's session store
 * (its only consumer). What remains here is the contract other plugins'
 * apply worlds reach for panel transitions (sidebar toggle from ui-sidebar,
 * details open/close from ui-chat) — writes stay inside the store's
 * declared action set, delivered as the registration's bound actions.
 *
 * v0.1.5 合并后追加官方兼容面：selectPanel/beginNavigation（官方中央面板
 * 导航，本地无全局面板概念，最小实现见各方法注释）、openRightbar/closeRightbar
 * （官方右栏形态上报，本地映射到 details 列的打开/关闭）。
 */
import type { BoundActions, HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { notifySubscribers } from '@deepseek-ai/dsh-client-store'
import type { createLayoutStore } from './stores.ts'

/**
 * 官方 v0.1.5 中央面板槽 'main' 的面板标识（branded string）。官方包
 * （ui-sidebar 的面板行元数据、ui-workspace 的导航）用它寻址中央面板；
 * 本地面板架构没有全局中央面板，该类型仅作兼容面保留。
 */
export type MainPanelId = Branded<'MainPanelId'>

/**
 * 根作用域面板选择快照（usePanelInfo 的订阅源）。本地面板架构默认恒为
 * `activePanelId: null`（会话视图）；仅当官方包调用 selectPanel 时切换。
 */
export interface PanelInfo {
  /** 选中的全局中央面板；null 表示显示会话。 */
  readonly activePanelId: MainPanelId | null
}

/** 面板信息选择器钩子（GlobalStandardProps.usePanelInfo 的实现类型）。 */
export type UsePanelInfo = SnapshotSelectorHook<PanelInfo>

/** The layout store's bound action set (framework-baked, draft params peeled). */
export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/**
 * The outward layout face (`ctx.layout`): the panel transitions other
 * plugins may trigger — and exactly what a test fake must supply. The
 * attachPanels wiring hook stays on the concrete class (root-entry assembly
 * only).
 */
export interface ILayout {
  /**
   * 选择全局中央面板而不改变当前会话（官方兼容面）。
   * @param panelId - 已注册的 'main' 槽 key，或 null 回到会话视图。
   */
  selectPanel(panelId: MainPanelId | null): void
  /**
   * 开始一次异步导航，作废此前未完成的导航（官方兼容面）。
   * @returns 下一次导航或布局卸载时中止的信号；提交 UI 状态前先检查它。
   */
  beginNavigation(): AbortSignal
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void
  /** Open the details panel (no-op when already open). */
  openDetails(): void
  /** Close the details panel. */
  closeDetails(): void
  /** Open the bottom panel (no-op when already open). */
  openBottom(): void
  /** Close the bottom panel. */
  closeBottom(): void
  /**
   * 官方兼容面：右栏 occupant 上报"已展开 + 轨道/全屏形态"。
   * 本地面板架构把右栏等价于 details 列，且只有"打开/关闭"两种形态
   * （无轨道悬浮与全屏覆盖），故 track/fullscreen 仅保留签名兼容，
   * 调用一律映射为打开 details 列。
   * @param track - 是否让中心列让出轨道（本地忽略）。
   * @param fullscreen - 是否覆盖整帧（本地忽略）。
   */
  openRightbar(track: boolean, fullscreen: boolean): void
  /** 官方兼容面：右栏 occupant 上报隐藏，映射为关闭 details 列。 */
  closeRightbar(): void
}

/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController implements ILayout {
  #panels: PanelActions | undefined
  /** 'main' 槽已注册 key 的实时校验（selectPanel 用；attach 时由 apply 注入）。 */
  #hasMainPanel: ((id: MainPanelId) => boolean) | undefined
  /** 未完成导航的取消源；beginNavigation 作废旧信号并发放新信号。 */
  #navigation = new AbortController()
  #panelInfo: PanelInfo = { activePanelId: null }
  #panelInfoListeners = new Set<() => void>()

  /**
   * 面板信息根源（getSnapshot/subscribe 对）。apply 经
   * ctx.slots.provideRoot 注入后，root 槽组件通过 usePanelInfo 读取。
   */
  readonly panelInfo: HostObservable<PanelInfo> = {
    getSnapshot: () => this.#panelInfo,
    subscribe: (listener) => {
      this.#panelInfoListeners.add(listener)
      return () => { this.#panelInfoListeners.delete(listener) }
    },
  }

  /**
   * Adopt the root entry's bound store actions. Called from the root
   * registration's inject hook (a sanctioned assembly side effect), so the
   * face is live from the entry's first render; on entry re-register the
   * fresh actions overwrite the stale set.
   * @param actions - bound actions of the entry's layout store instance.
   * @param hasMainPanel - 校验 'main' 槽是否注册了指定 key（缺省视为无）。
   */
  attachPanels(actions: PanelActions, hasMainPanel?: (id: MainPanelId) => boolean): void {
    this.#panels = actions
    this.#hasMainPanel = hasMainPanel
  }

  /**
   * 选择全局中央面板或回到会话视图。本地无全局面板时 activePanelId 恒为
   * null，AppFrame 的 'main' 槽以保留 key 'conversation' 分发；官方包注册
   * 的全局面板经此切换。与官方一致：未注册的 key 直接抛错，且作废未完成的
   * 导航。
   * @param panelId - 面板 key 或 null。
   */
  selectPanel(panelId: MainPanelId | null): void {
    if (panelId !== null && this.#hasMainPanel?.(panelId) !== true) {
      throw new Error(`layout.selectPanel: main panel "${panelId}" is not registered`)
    }
    this.#navigation.abort()
    if (this.#panelInfo.activePanelId === panelId) return
    this.#panelInfo = { activePanelId: panelId }
    notifySubscribers(this.#panelInfoListeners, '[ui-layout] panel info')
  }

  /**
   * 作废此前未完成的导航并返回新导航的取消信号（官方语义：后发导航取代
   * 先发导航）。
   * @returns 新导航的取消信号。
   */
  beginNavigation(): AbortSignal {
    this.#navigation.abort()
    this.#navigation = new AbortController()
    return this.#navigation.signal
  }

  /** 布局卸载时作废所有未完成导航（apply 的清理钩子调用）。 */
  dispose(): void {
    this.#navigation.abort()
  }

  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void {
    this.#require().toggleSidebar()
  }

  /** Open the details panel (no-op when already open). */
  openDetails(): void {
    this.#require().openDetails()
  }

  /** Close the details panel. */
  closeDetails(): void {
    this.#require().closeDetails()
  }

  /** Open the bottom panel (no-op when already open). */
  openBottom(): void {
    this.#require().openBottom()
  }

  /** Close the bottom panel. */
  closeBottom(): void {
    this.#require().closeBottom()
  }

  /**
   * 官方右栏形态上报，本地映射为打开 details 列（见 ILayout 注释）。
   * @param _track - 官方轨道标志（本地忽略）。
   * @param _fullscreen - 官方全屏标志（本地忽略）。
   */
  openRightbar(_track: boolean, _fullscreen: boolean): void {
    this.#require().openDetails()
  }

  /** 官方右栏隐藏上报，本地映射为关闭 details 列。 */
  closeRightbar(): void {
    this.#require().closeDetails()
  }

  #require(): PanelActions {
    // Callers are UI gestures, which cannot fire before the root entry
    // rendered (the inject hook runs in its first render) — reaching this
    // unwired is a boot-order bug, not a race to tolerate.
    if (this.#panels === undefined) throw new Error('layout: panel actions not wired (root entry not mounted)')
    return this.#panels
  }
}
