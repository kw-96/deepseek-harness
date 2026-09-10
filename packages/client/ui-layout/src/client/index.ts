/**
 * Layout plugin, browser half: one register() call contributes AppFrame into
 * the runtime's built-in 'root' slot and, in the same breath, declares the
 * child slots (declaration = exclusive render authority), seats the
 * layout store (panel geometry), and wires the panel-action service face.
 * ctx.layout is the cross-plugin panel-action contract; navigation state lives
 * with the runtime sessions service. A second effect seats the theme
 * presenter, which projects ctx.theme snapshots onto document.body.
 *
 * v0.1.5 合并兼容面：'main' 与 'rightbar' 是官方槽位在本地面板架构下的别名
 * ——'main'（keyed）等价于中心列 'conversation' 槽，'rightbar' 等价于右列
 * 'details' 槽；AppFrame 在两列中同时渲染别名槽。root 运行时分享额外提供
 * usePanelInfo（经 ctx.slots.provideRoot 注入 panelInfo 根源），官方
 * DocumentTitle 与 RightbarRoot 通过 PropsRuntime<'root'> 读取。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { MainPanelId, UsePanelInfo } from './service.ts'
import type { PanelActions } from './service.ts'
import { AppFrame } from './AppFrame.tsx'
import { createLayoutStore } from './stores.ts'
import { LayoutController } from './service.ts'
import { ThemePresenter } from './theme-presenter.ts'

// Contract exports only (export-convergence rule: cross-package consumers
// keep a symbol exported; test-only/package-internal symbols live off /src).
// ILayout: the ctx.layout face consumers and test fakes type against.
// OwnerShare contracts below are the render-side halves registrants compose
// against; the frame components and the store factory are package-internal.
export { LayoutController } from './service.ts'
export type { ILayout, MainPanelId, PanelInfo, UsePanelInfo } from './service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The outward face only; the concrete service stays inside this plugin. */
    layout: import('./service.ts').ILayout
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface GlobalStandardProps {
    /** Subscribe to the selected main panel independently of parent renders. */
    usePanelInfo: UsePanelInfo
  }

  interface SlotMap {
    // The 'root' entry itself is the runtime's built-in slot (declared
    // there); these children are declared by the same register() call that
    // contributes AppFrame. Session owners never pass sessionId: the
    // framework injects it as a standard prop.
    /**
     * The whole left column. OCCUPIED by ui-sidebar's SidebarRoot, which
     * declares the workspace and settings seats inside it — registering here
     * replaces the navigation column outright rather than adding to it, and
     * the seats it declares disappear with it. To add something to the
     * sidebar, register into one of those inner seats instead.
     *
     * The occupant receives the frame's live column state (collapsed, width)
     * and is expected to render the compact control rail while collapsed.
     */
    'sidebar': { kind: 'single'; scope: 'root'; owner: SidebarOwnerProps }
    /**
     * The whole center column, across both the no-session hero and a live
     * conversation. OCCUPIED by ui-conversation's ConversationRoot, which
     * declares the session body, composer, and input seats inside it —
     * registering here replaces the entire conversation surface (and removes
     * every seat it declares) rather than adding to it.
     *
     * Current-session-optional: the occupant owns both states without
     * changing its React identity, so it keeps its own state across a session
     * switch. It receives no owner props; session facts arrive through the
     * framework hooks of the `session-maybe` scope.
     */
    'conversation': { kind: 'single'; scope: 'session-maybe'; owner: ConvOwnerProps }
    /**
     * 官方 v0.1.5 中央面板槽在本地的别名槽：官方包（ui-conversation 的
     * ConversationPanel，key 恒为保留的 'conversation'；未来的全局面板按
     * 各自 key）注册到这里，AppFrame 在中心列与本地 'conversation' 槽
     * 同时渲染，并以 usePanelInfo 的 activePanelId（缺省 'conversation'）
     * 作 keyed 分发。
     */
    'main': { kind: 'keyed'; scope: 'root' }
    /**
     * The right details column, shown when the layout opens it. OCCUPIED by
     * ui-conversation's DetailsPanel, which declares the tool-details seat
     * inside it — registering here replaces the column and takes that seat
     * with it. Absent an occupant the column renders nothing.
     *
     * No owner props: the framework injects the session id and hooks for the
     * `session` scope, and `ctx.layout` owns whether the column is open.
     */
    'details': { kind: 'single'; scope: 'session'; owner: DetailsOwnerProps }
    /**
     * 官方 v0.1.5 右栏槽在本地的别名槽：官方包（ui-sidebar-right 的
     * RightbarRoot）注册到这里，AppFrame 在右列与本地 'details' 槽同时
     * 渲染。保持官方的 root 作用域与 RightbarOwnerProps owner share
     * （occupant 自带 SessionProvider 门控会话内容）；面板锚定帧右缘、
     * 列关闭时滑出帧外，形态上报经 ctx.layout.openRightbar/closeRightbar
     * 映射到本地 details 列的开合。
     */
    'rightbar': { kind: 'single'; scope: 'root'; owner: RightbarOwnerProps }
    /**
     * The bottom panel spans the center and details regions. It is session
     * scoped so terminal ownership follows the selected live Agent.
     */
    'bottom': { kind: 'single'; scope: 'session'; owner: BottomOwnerProps }
    /**
     * Frame-wide floating layer, above every column and outside their scroll
     * containers. Deliberately generic and unowned by any feature: a badge, a
     * toast stack or a status pill all belong here, and entries order among
     * themselves. The layer itself is click-through — entries opt back into
     * pointer events — so an occupant never blocks the app underneath.
     *
     * This is the additive seat for a frame-wide surface of your own: a fresh
     * `id` is added beside the shipped entries instead of replacing them.
     */
    'shell.overlay': { kind: 'list'; scope: 'root' }
  }
}

// OwnerShare contracts — the render-side share the slot owner supplies at
// renderSlot. Registrants IMPORT these and compose their full component props
// through the four-share intersection (PropsRuntime & PropsRenderSlots &
// PropsStore & I). Conversation business state and actions arrive through
// framework-standard hooks and each registrant's inject face, not owner props.

/** Sidebar owner share: live column state from the frame's concession solve. */
export interface SidebarOwnerProps {
  /** True when the sidebar is closed (the column renders the compact control rail). */
  collapsed: boolean
  /** Rendered column width in px (SIDEBAR_COLLAPSED when collapsed). */
  width: number
}

/** Conversation owner share: business state and actions belong to the registrant. */
export interface ConvOwnerProps {}

/** Details owner share: empty — sessionId arrives as a framework-standard prop. */
export interface DetailsOwnerProps {}

/** Bottom owner share: empty — sessionId arrives as a framework-standard prop. */
export interface BottomOwnerProps {}

/**
 * 右栏 owner share：与官方 v0.1.5 签名一致（ui-sidebar-right 的 RightbarRoot
 * 解构并把同一份几何转发给 'rightbar.session'）。本地由 AppFrame 从 details
 * 列的解算结果派生。
 */
export interface RightbarOwnerProps {
  /** 正常形态下面板的解析宽度（像素）；放不下时为 0。 */
  width: number
  /** 当前帧宽（像素）。 */
  viewportWidth: number
  /** 正常宽度的面板能否保留（本地 = details 列解算结果非 0）。 */
  canShow: boolean
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'theme', 'locale', 'sessions']

/**
 * Client plugin body: provide ctx.layout, then one register() call — AppFrame
 * into 'root' with the child-slot declarations, the layout store seat, and
 * the inject hook that hands the store's bound actions to the service. The
 * panel-info root source rides the same effect so HMR reload removes it with
 * the registration.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const layout = new LayoutController()
  ctx.effect(() => {
    // 面板信息根源：官方包通过 PropsRuntime<'root'> 的 usePanelInfo 读取。
    const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo: layout.panelInfo } })
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRegistration = ctx.slots.register({
      name: 'root',
      locale: 'common',
      children: {
        'sidebar': { kind: 'single', scope: 'root' },
        'conversation': { kind: 'single', scope: 'session-maybe' },
        'main': { kind: 'keyed', scope: 'root' },
        'details': { kind: 'single', scope: 'session' },
        'rightbar': { kind: 'single', scope: 'root' },
        'bottom': { kind: 'single', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
      // Exclusive store: the factory itself — the framework instantiates per
      // entry and delivers useStore/actions to AppFrame as standard props.
      store: createLayoutStore,
      // The hook's only side effect connects the root store to ctx.layout;
      // conversation business actions belong to their registrants.
      inject: (actions: PanelActions) => {
        layout.attachPanels(actions, (id: MainPanelId) =>
          ctx.slots.entries('main').some(entry => entry.options.key === id))
        return {
          openSession: (id) => { ctx.sessions.open(id) },
        }
      },
    }, AppFrame)
    return () => {
      disposeRegistration()
      disposePanelInfo()
      layout.dispose()
      // provide()'s disposer settles asynchronously; teardown is synchronous fire-and-forget.
      void disposeService()
    }
  }, 'ui-layout: service + root registration')

  // Theme presentation: pure DOM writes from resolved snapshots — initial
  // state through the getter once, then event-driven only; no React path.
  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'ui-layout: theme presenter')
}
