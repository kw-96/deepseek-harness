/**
 * dsh-workspace-rail 浏览器入口：挂载 codexLeft Remote（目录列举 + 项目注册表）
 * 并注册左侧导航面 ——
 * 遮蔽 sidebar.workspaces 的 Codex 式工作区浏览器、隐藏侧栏顶部品牌文字、
 * 挂在侧栏页脚槽位的添加工作区弹窗，以及新建会话页的项目选择器。
 *
 * 底栏终端属于 dsh-codex-shell：本插件只在会话菜单里调用它的
 * `remote.codexShell.terminalOpen`，未安装时该菜单项禁用，不构成硬依赖。
 * 插件/MCP/Skills 统一走宿主「设置 → 插件」。
 *
 * 对宿主编译采用本地结构面（faces.ts）而非宿主编排类型线；运行时的
 * 槽位核心仍会对每个名字做加载期强校验。
 */
import type { Context } from '@deepseek-ai/cordis'
import remoteContribution from 'dsh-workspace-rail/remote'
import { SessionMetaStore } from './state/session-meta.js'
import { BrowserPrefsStore } from './state/prefs.js'
import { SidebarBrandControls } from './browser/parts/brand-controls.js'
import { CodexBrowser } from './browser/WorkspaceBrowser.js'
import { AddWorkspaceAction } from './overlays/workspace-picker.js'
import { ProjectPicker } from './overlays/hero-picker.js'
import {
  createAddWorkspaceInject, createBrowserInject, createHeroInject,
  type CodexLeftDeps, type OpenWorkspacePathFace,
} from './inject.js'
import { en, zh } from './locales.js'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  CodexLeftRemoteFace, LayoutFace, LocaleFace, RemoteFace, SessionsFace, SlotsFace, TerminalOpenFace,
  WorkspacesFace,
} from './faces.js'

export const inject = ['slots', 'locale', 'remote', 'sessions', 'workspaces', 'connection']

/**
 * 组装注入面依赖包：终端 remote 用取值函数延迟读取，插件后挂载也能生效。
 * @param ctx - 客户端根上下文。
 * @returns 各槽位注入面工厂共享的依赖。
 */
function dependencies(ctx: Context): CodexLeftDeps {
  return {
    sessions: ctx.get('sessions') as SessionsFace,
    workspaces: ctx.get('workspaces') as WorkspacesFace,
    codexLeft: ctx.get('remote.codexLeft') as CodexLeftRemoteFace,
    sessionRemote: ctx.get('remote.session') as OpenWorkspacePathFace | undefined,
    connection: ctx.get('connection'),
    layout: ctx.get('layout') as LayoutFace | undefined,
    terminal: () => ctx.get('remote.codexShell') as TerminalOpenFace | undefined,
    meta: new SessionMetaStore(),
    prefs: new BrowserPrefsStore(),
  }
}

/**
 * 挂载 Remote 并注册左侧导航面的全部槽位。
 * @param ctx - 客户端根上下文。
 * @returns 卸载函数：注销所有槽位、文案命名空间与 Remote 贡献。
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const remote = ctx.get('remote') as RemoteFace
  const locale = ctx.get('locale') as LocaleFace
  const slots = ctx.get('slots') as SlotsFace

  const disposeRemote = await remote.$mount(remoteContribution)
  const disposeLocale = locale.register('workspace-rail', { zh, en } as Record<string, Record<string, string>>)
  const deps = dependencies(ctx)

  // 每处注册都通过 slots.inject 等待宿主声明（apply 顺序不受约束）。
  const disposeBrowser = slots.inject('sidebar.workspaces', () => slots.register({
    name: 'sidebar.workspaces',
    priority: -1,
    locale: 'workspace-rail',
    inject: () => createBrowserInject(deps),
  }, CodexBrowser))
  // 隐藏侧栏顶部品牌文字（宿主 fallback 显示「DSH 本地构建」+ 版本号）：
  // 注册空渲染组件占用 single 槽位，品牌行只剩图标按钮。
  const disposeBrandName = slots.inject('sidebar.brand.name', () => slots.register({
    name: 'sidebar.brand.name', id: 'codex-hide-brand-name', locale: 'workspace-rail',
  }, () => null))
  // 侧栏顶部品牌区控制：mark 槽挂载 SidebarBrandControls ——
  // Web 宽态隐藏品牌按钮、保留壳层折叠按钮并压缩行高；轨道态常显
  // 打开图标；桌面独立窗口两种状态都不显示开合控件（标题栏负责）。
  const disposeBrandMark = slots.inject('sidebar.brand.mark', () => slots.register({
    name: 'sidebar.brand.mark', id: 'codex-sidebar-brand-controls', locale: 'workspace-rail',
  }, SidebarBrandControls))
  // 添加工作区弹窗挂在侧栏页脚槽位（只承载弹窗与打开器，页脚无可见按钮；
  // 打开入口为侧栏标题栏「+」与桌面标题栏 File → Open Workspace）。
  const disposeAddWorkspace = slots.inject('sidebar.footer.action', () => slots.register({
    name: 'sidebar.footer.action', id: 'codex-add-workspace', order: 0,
    locale: 'workspace-rail',
    inject: () => createAddWorkspaceInject(deps),
  }, AddWorkspaceAction))
  // 新建会话页的项目选择器：遮蔽宿主自带的工作区选择器（priority -1），
  // 列表选「项目」；多工作区项目再展开工作树让用户选一个。
  const disposeHeroPicker = slots.inject('conversation.hero.workspace', () => slots.register({
    name: 'conversation.hero.workspace', priority: -1, locale: 'workspace-rail',
    inject: () => createHeroInject(deps),
  }, ProjectPicker))

  return async () => {
    disposeHeroPicker()
    disposeAddWorkspace()
    disposeBrandMark()
    disposeBrandName()
    disposeBrowser()
    disposeLocale()
    await disposeRemote()
  }
}
