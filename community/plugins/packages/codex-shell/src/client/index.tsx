/**
 * dsh-codex-shell 浏览器入口：挂载 codexShell Remote 并注册界面 ——
 * 遮蔽 sidebar.workspaces 的 Codex 式工作区浏览器、侧栏页脚的添加工作区
 * 入口、停靠进宿主 details 第三列的右侧工作台面板、以及会话头的面板
 * 开合按钮。面板开合通过 ctx.layout 与宿主第三列双向同步。
 *
 * 对宿主编译采用本地结构面（faces.ts）而非宿主编排类型线；运行时的
 * 槽位核心仍会对每个名字做加载期强校验。
 */
import type { Context } from '@deepseek-ai/cordis'
import remoteContribution from 'dsh-codex-shell/remote'
import { SessionMetaStore } from './session-meta.js'
import { BrowserPrefsStore } from './sidebar/prefs.js'
import { CodexBrowser, type CodexBrowserInjected } from './WorkspaceBrowser.js'
import { CodexRightPanel, type CodexPanelInjected, type CodexMcpManager, type CodexSkillsManager, type CommandPrompt } from './RightPanel.js'
import { PanelToggle, type PanelToggleInjected } from './PanelToggle.js'
import { BottomTerminalPanel } from './bottom/BottomTerminalPanel.js'
import { AddWorkspaceAction, type AddWorkspaceInjected } from './workspace-picker.js'
import { PanelController } from './panel-controller.js'
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

/** 某会话的持久用户指令；传输缺失或失败时返回空列表。 */
async function readPrompts(connection: unknown, sessionId: string): Promise<readonly CommandPrompt[]> {
  const probe = connection as ConnectionProbeLike
  const history = probe.api?.sessions?.history
  if (history === undefined) return []
  try {
    const result = await history({ sessionId, maxMessages: 400 })
    if (!result.ok) return []
    const prompts: CommandPrompt[] = []
    for (const record of result.value.records ?? []) {
      const event = record as {
        type?: string
        seq?: number
        data?: { content?: readonly { type?: string; text?: string }[]; source?: { kind?: string } }
      }
      if (event.type !== 'user/message') continue
      if (event.data?.source?.kind !== 'user') continue
      const text = (event.data.content ?? [])
        .filter(block => block.type === 'text')
        .map(block => block.text ?? '')
        .join('')
      if (text.trim() !== '') prompts.push({ seq: event.seq ?? 0, text })
    }
    return prompts.reverse()
  } catch {
    return []
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

  const panel = new PanelController()
  const meta = new SessionMetaStore()
  const prefs = new BrowserPrefsStore()

  ctx.effect(() => () => { panel.dispose() }, 'codex-shell: panel controller')

  const codexRemote = ctx.get('remote.codexShell') as CodexShellRemoteFace
  const sessionRemote = ctx.get('remote.session') as {
    openWorkspacePath?: (request: { path: string }) => Promise<{ ok: boolean; error?: { message: string } }>
  } | undefined
  const pluginManager = probeRemote(ctx, 'pluginManager') as CodexPanelInjected['pluginManager']
  const marketplace = probeRemote(ctx, 'marketplace') as CodexPanelInjected['marketplace']
  const mcpManager = probeMcpManager(pluginManager)
  const skillsManager = probeSkillsManager(pluginManager)

  /** 面板开合与宿主 details 列同步；布局服务缺失时降级为纯本地状态。 */
  const setColumnOpen = (open: boolean): void => {
    if (layout === undefined) return
    if (open) layout.openDetails()
    else layout.closeDetails()
  }
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
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
    archiveSession: async (sessionId) => { await workspaces.archiveSession(sessionId) },
    insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
      await workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
    },
    attachSession: async (workspaceId, sessionId) => {
      await workspaces.attachSession(workspaceId, sessionId)
    },
    detachSession: async (workspaceId, sessionId) => {
      await workspaces.detachSession(workspaceId, sessionId)
    },
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
    meta,
    prefs,
  })

  const addWorkspaceInject = (): AddWorkspaceInjected => ({
    fsList: async path => unwrap(await codexRemote.fsList(path)),
    createWorkspace: input => workspaces.create(input),
  })

  const panelInject = (): CodexPanelInjected => ({
    panel,
    meta,
    api: {
      fsList: async path => unwrap(await codexRemote.fsList(path)),
      fsRead: async (path, maxBytes) => unwrap(await codexRemote.fsRead(path, maxBytes)),
      fsWrite: async (path, content) => unwrap(await codexRemote.fsWrite(path, content)),
      fsSearchName: async (root, query, options) => unwrap(await codexRemote.fsSearchName(root, query, options)),
      fsSearchContent: async (root, query, options) => unwrap(await codexRemote.fsSearchContent(root, query, options)),
      gitStatus: async cwd => unwrap(await codexRemote.gitStatus(cwd)),
      gitLog: async (cwd, count) => unwrap(await codexRemote.gitLog(cwd, count)),
      gitDiff: async (cwd, path, staged) => unwrap(await codexRemote.gitDiff(cwd, path, staged)),
      gitStage: async (cwd, path) => unwrap(await codexRemote.gitStage(cwd, path)),
      gitUnstage: async (cwd, path) => unwrap(await codexRemote.gitUnstage(cwd, path)),
      gitDiscard: async (cwd, path) => unwrap(await codexRemote.gitDiscard(cwd, path)),
      gitCommit: async (cwd, message) => unwrap(await codexRemote.gitCommit(cwd, message)),
      gitBranches: async cwd => unwrap(await codexRemote.gitBranches(cwd)),
      gitCheckout: async (cwd, branch) => unwrap(await codexRemote.gitCheckout(cwd, branch)),
      gitFetch: async cwd => unwrap(await codexRemote.gitFetch(cwd)),
      gitPull: async cwd => unwrap(await codexRemote.gitPull(cwd)),
      gitPush: async cwd => unwrap(await codexRemote.gitPush(cwd)),
      gitStageAll: async cwd => unwrap(await codexRemote.gitStageAll(cwd)),
      gitUnstageAll: async cwd => unwrap(await codexRemote.gitUnstageAll(cwd)),
      terminalOpen: async (sessionId, options) => unwrap(await codexRemote.terminalOpen(sessionId, options)),
      terminalList: async sessionId => unwrap(await codexRemote.terminalList(sessionId)),
      terminalSend: async (sessionId, terminalId, text) => unwrap(await codexRemote.terminalSend(sessionId, terminalId, text)),
      terminalFollow: (sessionId, terminalId, signal) => codexRemote.terminalFollow(sessionId, terminalId, signal),
      terminalWrite: async (sessionId, terminalId, data) => unwrap(await codexRemote.terminalWrite(sessionId, terminalId, data)),
      terminalResize: async (sessionId, terminalId, cols, rows) => unwrap(await codexRemote.terminalResize(sessionId, terminalId, cols, rows)),
      terminalRead: async (sessionId, terminalId) => unwrap(await codexRemote.terminalRead(sessionId, terminalId)),
      terminalClose: async (sessionId, terminalId) => unwrap(await codexRemote.terminalClose(sessionId, terminalId)),
      projectDirs: async workspaceId => unwrap(await codexRemote.projectDirs(workspaceId)),
      projectSetDirs: async (workspaceId, dirs) => unwrap(await codexRemote.projectSetDirs(workspaceId, dirs)),
      projectAddDir: async (workspaceId, path) => unwrap(await codexRemote.projectAddDir(workspaceId, path)),
    },
    pluginManager,
    marketplace,
    mcpManager,
    skillsManager,
    history: sessionId => readPrompts(connection, sessionId),
    setColumnOpen,
  })

  const toggleInject = (): PanelToggleInjected => ({ panel, meta, setColumnOpen, setBottomOpen })

  // 每处注册都通过 slots.inject 等待宿主声明（apply 顺序不受约束）。
  const disposeBrowser = slots.inject('sidebar.workspaces', () => slots.register({
    name: 'sidebar.workspaces',
    priority: -1,
    locale: 'codex-shell',
    inject: browserInject,
  }, CodexBrowser))
  // 添加工作区入口放在侧栏页脚（root 作用域，宽/窄两态均可用）。
  const disposeAddWorkspace = slots.inject('sidebar.footer.action', () => slots.register({
    name: 'sidebar.footer.action', id: 'codex-add-workspace', order: 0,
    locale: 'codex-shell',
    inject: addWorkspaceInject,
  }, AddWorkspaceAction))
  // 停靠进宿主第三列：priority -1 遮蔽原生工具详情面板，列宽/拖拽/动画由宿主布局接管。
  const disposePanel = slots.inject('details', () => slots.register({
    name: 'details',
    priority: -1,
    locale: 'codex-shell',
    inject: panelInject,
  }, CodexRightPanel))
  const disposeBottom = slots.inject('bottom', () => slots.register({
    name: 'bottom', priority: -1, locale: 'codex-shell',
    inject: () => ({ api: panelInject().api, close: () => { setBottomOpen(false) } }),
  }, BottomTerminalPanel))
  const disposeToggle = slots.inject('conversation.session.header.utilities', () => slots.register({
    name: 'conversation.session.header.utilities', id: 'codex-panel-toggle', order: 20,
    label: () => t('openRightPanel'), locale: 'codex-shell',
    inject: toggleInject,
  }, PanelToggle))

  return async () => {
    disposeToggle()
    disposeBottom()
    disposePanel()
    disposeAddWorkspace()
    disposeBrowser()
    disposeLocale()
    await disposeRemote()
  }
}

/** 读取一个可选 remote 命名空间（插件管家/市场包）。 */
function probeRemote(ctx: Context, name: string): unknown {
  return ctx.get(`remote.${name}`)
}

/** 探测 pluginManager 命名空间上的 MCP 方法；任一缺失即整体不可用。 */
function probeMcpManager(pluginManager: unknown): CodexMcpManager | undefined {
  const candidate = pluginManager as Partial<CodexMcpManager> | undefined
  if (
    candidate === undefined
    || typeof candidate.listMcpServers !== 'function'
    || typeof candidate.saveMcpServer !== 'function'
    || typeof candidate.removeMcpServer !== 'function'
    || typeof candidate.setMcpServerEnabled !== 'function'
  ) return undefined
  return candidate as CodexMcpManager
}

/** 探测 pluginManager 命名空间上的 Skills 方法；任一缺失即整体不可用。 */
function probeSkillsManager(pluginManager: unknown): CodexSkillsManager | undefined {
  const candidate = pluginManager as Partial<CodexSkillsManager> | undefined
  if (
    candidate === undefined
    || typeof candidate.listSkills !== 'function'
    || typeof candidate.setSkillModelInvocation !== 'function'
  ) return undefined
  return candidate as CodexSkillsManager
}
