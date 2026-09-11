/**
 * dsh-codex-shell 浏览器入口：挂载 codexShell Remote 并注册界面 ——
 * 遮蔽 sidebar.workspaces 的 Codex 式工作区浏览器、隐藏侧栏顶部品牌
 * 文字（DSH 本地构建）、挂在侧栏页脚槽位的添加工作区弹窗（页脚无
 * 可见按钮）、底部多 tab 交互终端，以及会话头的底部终端按钮。
 * 右侧面板由宿主官方右栏（ui-sidebar-right）提供并与本插件无关；本插件
 * 不注册 details / rightbar 槽位，也不提供右侧开合按钮。
 * 插件/MCP/Skills 统一走宿主「设置 → 插件」。
 *
 * 对宿主编译采用本地结构面（faces.ts）而非宿主编排类型线；运行时的
 * 槽位核心仍会对每个名字做加载期强校验。
 */
import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useRef } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import remoteContribution from 'dsh-codex-shell/remote'
import { SessionMetaStore } from './session-meta.js'
import { BrowserPrefsStore } from './sidebar/prefs.js'
import { CodexBrowser, type CodexBrowserInjected } from './WorkspaceBrowser.js'
import { PanelToggle, type PanelToggleInjected } from './PanelToggle.js'
import { BottomTerminalPanel } from './bottom/BottomTerminalPanel.js'
import type { TerminalApi } from './bottom/terminal-api.js'
import { AddWorkspaceAction, type AddWorkspaceInjected } from './workspace-picker.js'
import { ProjectPicker, type ProjectPickerInjected } from './hero/ProjectPicker.js'
import { en, zh } from './locales.js'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  CodexShellRemoteFace, LayoutFace, LocaleFace, RemoteFace, SessionsFace, SlotsFace, TFn, WorkspacesFace,
} from './faces.js'

export const inject = ['slots', 'locale', 'remote', 'sessions', 'workspaces', 'connection']

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (result.ok) return result.value
  throw new Error(`${result.error.code}: ${result.error.message}`)
}

/** 是否运行在 Tauri 桌面壳（与 ui-layout 的探测一致）。 */
function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false
  const candidate = window as Window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }
  return candidate.__TAURI_INTERNALS__ !== undefined || candidate.__TAURI__ !== undefined
}

/**
 * 侧栏顶部品牌区控制（占用 sidebar.brand.mark 槽）：
 * - 宽态 Web：隐藏品牌按钮本身，保留壳层行与行内折叠按钮（位于
 *   新会话按钮上方），并压缩行高避免大片空白；
 * - 宽态桌面壳：整行隐藏（标题栏已提供开合）；
 * - 轨道态 Web：渲染常显的「打开侧栏」图标（壳层展开按钮即本槽内容，
 *   不再需要悬浮才出现）；
 * - 轨道态桌面壳：隐藏展开按钮（标题栏已提供开合）。
 */
function SidebarBrandControls(): React.ReactNode {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const anchor = ref.current
    if (anchor === null) return
    const button = anchor.closest('button')
    if (button === null) return
    const desktop = isDesktopShell()
    const row = button.parentElement
    const wide = button.querySelector('[data-slot="sidebar.brand.name"]') !== null
    if (wide) {
      // 宽态：品牌按钮隐藏；桌面壳连整行一起隐藏（行内无其它控件）。
      button.style.display = 'none'
      if (desktop) {
        if (row !== null) row.style.display = 'none'
        return () => {
          button.style.display = ''
          if (row !== null) row.style.display = ''
        }
      }
      // Web：压缩空品牌行，让壳层折叠按钮贴住新会话按钮上方。
      const priorHeight = row?.style.height ?? ''
      const priorPadding = row?.style.padding ?? ''
      if (row !== null) {
        row.style.height = '28px'
        row.style.padding = '0 4px'
      }
      return () => {
        button.style.display = ''
        if (row !== null) {
          row.style.height = priorHeight
          row.style.padding = priorPadding
        }
      }
    }
    // 轨道态：桌面壳隐藏展开按钮，Web 保留（本组件渲染常显打开图标）。
    if (desktop && row !== null) {
      row.style.display = 'none'
      return () => { row.style.display = '' }
    }
    return undefined
  }, [])
  return (
    <>
      <div ref={ref} style={{ display: 'none' }} />
      <PanelLeftOpen size={18} aria-hidden="true" />
    </>
  )
}

interface SessionHistoryValueLike {
  records?: readonly unknown[]
}

interface ConnectionProbeLike {
  api?: {
    sessions?: {
      history?: (request: {
        sessionId: string
        maxMessages?: number
        beforeSeq?: number
      }) => Promise<{ ok: true; value: SessionHistoryValueLike } | { ok: false }>
    }
  }
}

/** 尽力导出会话用户/助手文本为 Markdown；失败返回 null。 */
async function exportSessionMarkdown(connection: unknown, sessionId: string): Promise<string | null> {
  const probe = connection as ConnectionProbeLike
  const history = probe.api?.sessions?.history
  if (history === undefined) return null
  try {
    const result = await history({ sessionId, maxMessages: 400 })
    if (!result.ok) return null
    const lines: string[] = []
    for (const record of result.value.records ?? []) {
      const event = record as {
        type?: string
        data?: { content?: readonly { type?: string; text?: string }[]; source?: { kind?: string } }
      }
      const text = (event.data?.content ?? [])
        .filter(block => block.type === 'text')
        .map(block => block.text ?? '')
        .join('')
        .trim()
      if (text === '') continue
      if (event.type === 'user/message') lines.push(`## User\n\n${text}`)
      else if (event.type === 'assistant/message' || event.type === 'model/message') {
        lines.push(`## Assistant\n\n${text}`)
      }
    }
    return lines.length === 0 ? null : lines.join('\n\n')
  } catch {
    return null
  }
}

/**
 * 挂载 Remote 并注册全部 codex-shell 界面。
 * @param ctx - 客户端根上下文。
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const remote = ctx.get('remote') as RemoteFace
  const locale = ctx.get('locale') as LocaleFace
  const slots = ctx.get('slots') as SlotsFace
  const sessions = ctx.get('sessions') as SessionsFace
  const workspaces = ctx.get('workspaces') as WorkspacesFace
  const connection = ctx.get('connection')
  const layout = ctx.get('layout') as LayoutFace | undefined

  const disposeRemote = await remote.$mount(remoteContribution)
  const disposeLocale = locale.register('codex-shell', { zh, en } as Record<string, Record<string, string>>)
  const t: TFn = locale.bind('codex-shell')

  const meta = new SessionMetaStore()
  const prefs = new BrowserPrefsStore()

  const codexRemote = ctx.get('remote.codexShell') as CodexShellRemoteFace
  const sessionRemote = ctx.get('remote.session') as {
    openWorkspacePath?: (request: { path: string }) => Promise<{ ok: boolean; error?: { message: string } }>
  } | undefined

  /** 底部终端行开合；布局服务缺失时静默降级。 */
  const setBottomOpen = (open: boolean): void => {
    if (layout === undefined) return
    if (open) layout.openBottom()
    else layout.closeBottom()
  }

  const browserInject = (): CodexBrowserInjected => ({
    startSession: (workspaceId?: string) => {
      sessions.create(workspaceId === undefined ? {} : { workspaceId })
        .then(sessionId => { sessions.open(sessionId) })
        .catch(() => { /* 创建失败保持当前选择 */ })
    },
    open: sessionId => { sessions.open(sessionId) },
    searchSessions: async (query, signal) => {
      const result = await sessions.search(query, signal)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    searchResultLimit: sessions.searchResultLimit,
    renameSession: async (sessionId, title) => {
      const session = sessions.binding(sessionId)?.session
      if (session === undefined) throw new Error(`unknown session "${sessionId}"`)
      const result = await session.rename(title)
      if (!result.ok) throw new Error(result.error.message)
    },
    forkSession: (sessionId) => {
      sessions.fork({ sessionId, increaseTitle: true })
        .then(childId => { sessions.open(childId) })
        .catch(() => { /* 派生失败保持当前选择 */ })
    },
    renameWorkspace: async (workspaceId, title) => { await workspaces.rename(workspaceId, title) },
    deleteWorkspace: async (workspaceId) => { await workspaces.delete(workspaceId) },
    createWorkspace: async (input) => {
      const workspace = await workspaces.create(input)
      return { workspaceId: workspace.workspaceId, path: workspace.path }
    },
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
    archiveSession: async (sessionId) => { await workspaces.archiveSession(sessionId) },
    unarchiveSession: async (sessionId) => { await workspaces.unarchiveSession(sessionId) },
    insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
      await workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
    },
    attachSession: async (workspaceId, sessionId) => {
      await workspaces.attachSession(workspaceId, sessionId)
    },
    moveSession: async (workspaceId, sessionId) => {
      await workspaces.moveSession(workspaceId, sessionId)
    },
    detachSession: async (workspaceId, sessionId) => {
      await workspaces.detachSession(workspaceId, sessionId)
    },
    listProjects: async () => unwrap(await codexRemote.projectList()),
    createProject: async (name, roots) => unwrap(await codexRemote.projectCreate({ name, ...(roots === undefined ? {} : { roots }) })),
    renameProject: async (projectId, name) => unwrap(await codexRemote.projectRename({ projectId, name })),
    setProjectRoots: async (projectId, roots) => unwrap(await codexRemote.projectSetRoots({ projectId, roots })),
    deleteProject: async projectId => unwrap(await codexRemote.projectDelete({ projectId })),
    openWorkspacePath: async (path) => {
      const openPath = sessionRemote?.openWorkspacePath
      if (openPath === undefined) throw new Error('session.openWorkspacePath unavailable')
      const result = await openPath({ path })
      if (!result.ok) throw new Error(result.error?.message ?? 'openWorkspacePath failed')
    },
    openTerminalForSession: async (sessionId, cwd) => {
      setBottomOpen(true)
      await unwrap(await codexRemote.terminalOpen(sessionId, cwd === undefined || cwd === '' ? {} : { cwd }))
    },
    exportSessionMarkdown: (sessionId) => exportSessionMarkdown(connection, sessionId),
    canExportMarkdown: (connection as ConnectionProbeLike).api?.sessions?.history !== undefined,
    fsList: async path => unwrap(await codexRemote.fsList(path)),
    meta,
    prefs,
  })

  const addWorkspaceInject = (): AddWorkspaceInjected => ({
    fsList: async path => unwrap(await codexRemote.fsList(path)),
    createWorkspace: input => workspaces.create(input),
  })

  /** 新建会话页的项目选择器：项目注册表 + 工作区创建/复用 + 目录列举。 */
  const heroInject = (): ProjectPickerInjected => ({
    listProjects: async () => unwrap(await codexRemote.projectList()),
    prefs,
    createWorkspace: async (input) => {
      const workspace = await workspaces.create(input)
      return { workspaceId: workspace.workspaceId, path: workspace.path }
    },
    createProject: async (name, roots) => unwrap(await codexRemote.projectCreate({
      name, ...(roots === undefined ? {} : { roots }),
    })),
    fsList: async path => unwrap(await codexRemote.fsList(path)),
  })

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
  const disposeBrowser = slots.inject('sidebar.workspaces', () => slots.register({
    name: 'sidebar.workspaces',
    priority: -1,
    locale: 'codex-shell',
    inject: browserInject,
  }, CodexBrowser))
  // 隐藏侧栏顶部品牌文字（宿主 fallback 显示「DSH 本地构建」+ 版本号）：
  // 注册空渲染组件占用 single 槽位，品牌行只剩图标按钮。
  const disposeBrandName = slots.inject('sidebar.brand.name', () => slots.register({
    name: 'sidebar.brand.name', id: 'codex-hide-brand-name', locale: 'codex-shell',
  }, () => null))
  // 侧栏顶部品牌区控制：mark 槽挂载 SidebarBrandControls ——
  // Web 宽态隐藏品牌按钮、保留壳层折叠按钮并压缩行高；轨道态常显
  // 打开图标；桌面独立窗口两种状态都不显示开合控件（标题栏负责）。
  const disposeBrandMark = slots.inject('sidebar.brand.mark', () => slots.register({
    name: 'sidebar.brand.mark', id: 'codex-sidebar-brand-controls', locale: 'codex-shell',
  }, SidebarBrandControls))
  // 添加工作区弹窗挂在侧栏页脚槽位（只承载弹窗与打开器，页脚无可见按钮；
  // 打开入口为标题栏「+」与桌面标题栏 File → Open Workspace）。
  const disposeAddWorkspace = slots.inject('sidebar.footer.action', () => slots.register({
    name: 'sidebar.footer.action', id: 'codex-add-workspace', order: 0,
    locale: 'codex-shell',
    inject: addWorkspaceInject,
  }, AddWorkspaceAction))
  // 新建会话页的项目选择器：遮蔽宿主自带的工作区选择器（priority -1），
  // 列表选「项目」；多工作区项目再展开工作树让用户选一个。
  const disposeHeroPicker = slots.inject('conversation.hero.workspace', () => slots.register({
    name: 'conversation.hero.workspace', priority: -1, locale: 'codex-shell',
    inject: heroInject,
  }, ProjectPicker))
  // 底栏多 tab 终端占用宿主 bottom 行。
  const disposeBottom = slots.inject('bottom', () => slots.register({
    name: 'bottom', priority: -1, locale: 'codex-shell',
    inject: () => ({ api: terminalApi, close: () => { setBottomOpen(false) } }),
  }, BottomTerminalPanel))
  // 会话头工具按钮：Web 渲染底部终端按钮；桌面壳渲染空（顶部栏在窗口控制
  // 按钮左侧提供）。右侧面板由官方右栏自己的角落按钮负责，本插件不重复提供。
  const disposeToggle = slots.inject('conversation.session.header.utilities', () => slots.register({
    name: 'conversation.session.header.utilities', id: 'codex-panel-toggle', order: 20,
    label: () => t('bottomTerminal'), locale: 'codex-shell',
    inject: toggleInject,
  }, PanelToggle))

  return async () => {
    disposeToggle()
    disposeBottom()
    disposeHeroPicker()
    disposeAddWorkspace()
    disposeBrandMark()
    disposeBrandName()
    disposeBrowser()
    disposeLocale()
    await disposeRemote()
  }
}
