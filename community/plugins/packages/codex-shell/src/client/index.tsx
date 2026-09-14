/**
 * dsh-codex-shell 浏览器入口：挂载 codexShell Remote（底栏终端）并注册 ——
 * 宿主 bottom 行的多 tab 交互终端，以及会话头的终端开合按钮
 * （桌面独立窗口由顶部栏负责，会话头不渲染）。
 *
 * 左侧项目/工作区/会话导航面属于 dsh-codex-left：本插件不注册任何侧栏
 * 槽位，也不提供右侧面板（右侧由宿主官方右栏 ui-sidebar-right 负责）。
 * 插件/MCP/Skills 统一走宿主「设置 → 插件」。
 *
 * 对宿主编译采用本地结构面（faces.ts）而非宿主编排类型线；运行时的
 * 槽位核心仍会对每个名字做加载期强校验。
 */
import type { Context } from '@deepseek-ai/cordis'
import remoteContribution from 'dsh-codex-shell/remote'
import { PanelToggle, type PanelToggleInjected } from './PanelToggle.js'
import { BottomTerminalPanel } from './bottom/BottomTerminalPanel.js'
import type { TerminalApi } from './bottom/terminal-api.js'
import { en, zh } from './locales.js'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  CodexShellRemoteFace, LayoutFace, LocaleFace, RemoteFace, SlotsFace, TFn,
} from './faces.js'

export const inject = ['slots', 'locale', 'remote']

/**
 * 解开 Remote 结果，失败时抛出错误。
 * @param result - Remote 调用返回的结果联合。
 * @returns 成功时的值。
 */
function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (result.ok) return result.value
  throw new Error(`${result.error.code}: ${result.error.message}`)
}

/**
 * 挂载 Remote 并注册底栏终端与会话头按钮。
 * @param ctx - 客户端根上下文。
 * @returns 卸载函数：注销槽位、文案命名空间与 Remote 贡献。
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const remote = ctx.get('remote') as RemoteFace
  const locale = ctx.get('locale') as LocaleFace
  const slots = ctx.get('slots') as SlotsFace
  const layout = ctx.get('layout') as LayoutFace | undefined

  const disposeRemote = await remote.$mount(remoteContribution)
  const disposeLocale = locale.register('codex-shell', { zh, en } as Record<string, Record<string, string>>)
  const t: TFn = locale.bind('codex-shell')

  const codexRemote = ctx.get('remote.codexShell') as CodexShellRemoteFace

  /** 底部终端行开合；布局服务缺失时静默降级。 */
  const setBottomOpen = (open: boolean): void => {
    if (layout === undefined) return
    if (open) layout.openBottom()
    else layout.closeBottom()
  }

  /** 底部终端面板消费的 remote 面。 */
  const terminalApi: TerminalApi = {
    terminalOpen: async (sessionId, options) => unwrap(await codexRemote.terminalOpen(sessionId, options)),
    terminalList: async sessionId => unwrap(await codexRemote.terminalList(sessionId)),
    terminalFollow: (sessionId, terminalId, signal) => codexRemote.terminalFollow(sessionId, terminalId, signal),
    terminalWrite: async (sessionId, terminalId, data) => unwrap(await codexRemote.terminalWrite(sessionId, terminalId, data)),
    terminalResize: async (sessionId, terminalId, cols, rows) => unwrap(await codexRemote.terminalResize(sessionId, terminalId, cols, rows)),
    terminalRead: async (sessionId, terminalId) => unwrap(await codexRemote.terminalRead(sessionId, terminalId)),
    terminalClose: async (sessionId, terminalId) => unwrap(await codexRemote.terminalClose(sessionId, terminalId)),
  }

  const toggleInject = (): PanelToggleInjected => ({ setBottomOpen })

  // 每处注册都通过 slots.inject 等待宿主声明（apply 顺序不受约束）。
  // 底栏多 tab 终端占用宿主 bottom 行。
  const disposeBottom = slots.inject('bottom', () => slots.register({
    name: 'bottom', priority: -1, locale: 'codex-shell',
    inject: () => ({ api: terminalApi, close: () => { setBottomOpen(false) } }),
  }, BottomTerminalPanel))
  // 会话头工具按钮：Web 渲染底部终端按钮；桌面壳渲染空（顶部栏在窗口控制
  // 按钮左侧提供）。右侧面板由官方右栏自己的角落按钮负责。
  const disposeToggle = slots.inject('conversation.session.header.utilities', () => slots.register({
    name: 'conversation.session.header.utilities', id: 'codex-panel-toggle', order: 20,
    label: () => t('bottomTerminal'), locale: 'codex-shell',
    inject: toggleInject,
  }, PanelToggle))

  return async () => {
    disposeToggle()
    disposeBottom()
    disposeLocale()
    await disposeRemote()
  }
}
