/**
 * 右侧 Codex 面板（details 列 occupant）：顶部横向图标栏（Cursor 式，
 * 5 个主图标 + 溢出菜单）+ 文件/Git/项目/插件/MCP/Skills/命令/摘要/
 * 浏览器工作台，停靠进宿主第三列。关闭按钮同步收起 details 列；
 * 会话切换后自动重新展开，保持三栏工作区的持续存在感。
 */
import { useEffect } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { Files, GitBranch, FolderTree, Blocks, Terminal, StickyNote, Globe, Server, Sparkles } from 'lucide-react'
import type {
  FsContentSearchResponse, FsListResponse, FsNameSearchResponse, FsReadResponse, FsSearchOptions,
  GitBranchesResponse, GitDiffResponse, GitLogResponse, GitStatusResponse,
  ProjectAddDirResponse, ProjectDirsResponse,
} from 'dsh-codex-shell/types'
import type { SessionMetaStore } from './session-meta.js'
import { PanelController, usePanelState } from './panel-controller.js'
import { TabBar, type TabBarTab } from './panel-tabs.js'
import type { SelectorHook, SessionId, SessionListStateLike, TFn, WorkspaceSnapshotLike } from './faces.js'
import { FilesPanel } from './panels/files/FilesPanel.js'
import { GitPanel } from './panels/git/GitPanel.js'
import { ProjectsPanel } from './panels/ProjectsPanel.js'
import { PluginsPanel } from './panels/plugins/PluginsPanel.js'
import { McpPanel } from './panels/mcp/McpPanel.js'
import { SkillsPanel } from './panels/skills/SkillsPanel.js'
import { CommandsPanel } from './panels/CommandsPanel.js'
import { SummaryPanel } from './panels/SummaryPanel.js'
import { BrowserPanel } from './panels/BrowserPanel.js'
import css from './styles.module.css'

/** 面板标签页消费的宿主 API 面。 */
export interface CodexApi {
  fsList: (path: string) => Promise<FsListResponse>
  fsRead: (path: string, maxBytes?: number) => Promise<FsReadResponse>
  fsWrite: (path: string, content: string) => Promise<{ ok: true }>
  fsSearchName: (root: string, query: string, options?: FsSearchOptions) => Promise<FsNameSearchResponse>
  fsSearchContent: (root: string, query: string, options?: FsSearchOptions) => Promise<FsContentSearchResponse>
  gitStatus: (cwd: string) => Promise<GitStatusResponse>
  gitLog: (cwd: string, count?: number) => Promise<GitLogResponse>
  gitDiff: (cwd: string, path?: string, staged?: boolean) => Promise<GitDiffResponse>
  gitStage: (cwd: string, path?: string) => Promise<{ ok: true }>
  gitUnstage: (cwd: string, path?: string) => Promise<{ ok: true }>
  gitDiscard: (cwd: string, path: string) => Promise<{ ok: true }>
  gitCommit: (cwd: string, message: string) => Promise<{ ok: true }>
  gitBranches: (cwd: string) => Promise<GitBranchesResponse>
  gitCheckout: (cwd: string, branch: string) => Promise<{ ok: true }>
  gitFetch: (cwd: string) => Promise<{ ok: true }>
  gitPull: (cwd: string) => Promise<{ ok: true }>
  gitPush: (cwd: string) => Promise<{ ok: true }>
  gitStageAll: (cwd: string) => Promise<{ ok: true }>
  gitUnstageAll: (cwd: string) => Promise<{ ok: true }>
  terminalOpen: (sessionId: string, options?: {
    cwd?: string
    name?: string
    shellDialect?: 'bash' | 'pwsh'
    cols?: number
    rows?: number
  }) => Promise<{
    terminalId: string
    output: string
    status: { kind: string }
    name?: string
    origin: 'ui' | 'agent'
  }>
  terminalList: (sessionId: string) => Promise<{
    terminals: readonly {
      terminalId: string
      name?: string
      status: { kind: string }
      origin: 'ui' | 'agent'
    }[]
  }>
  terminalSend: (sessionId: string, terminalId: string, text: string) => Promise<{ output: string; status: { kind: string }; waitReason: string; truncated: boolean }>
  terminalFollow: (sessionId: string, terminalId: string, signal?: AbortSignal) => AsyncIterable<{ seq: number; chunk: string }>
  terminalWrite: (sessionId: string, terminalId: string, data: string) => Promise<{ ok: true }>
  terminalResize: (sessionId: string, terminalId: string, cols: number, rows: number) => Promise<{ ok: true }>
  terminalRead: (sessionId: string, terminalId: string) => Promise<{ output: string; truncated: boolean }>
  terminalClose: (sessionId: string, terminalId: string) => Promise<{ ok: true }>
  projectDirs: (workspaceId: string) => Promise<ProjectDirsResponse>
  projectSetDirs: (workspaceId: string, dirs: readonly string[]) => Promise<ProjectDirsResponse>
  projectAddDir: (workspaceId: string, path: string) => Promise<ProjectAddDirResponse>
}

/** 插件管家 remote 投射的一条清单行。 */
export interface InventoryEntryLike {
  entryId: string
  configId: string
  packageName: string
  category: string
  group: string
  description: string | null
  enabled: boolean
  phase: string | null
  protected: boolean
  protectionReason: string | null
  error: string | null
}

export interface InventorySnapshotLike {
  entries: readonly InventoryEntryLike[]
}

/** 可选的插件管家 remote 面，渲染时探测。 */
export interface CodexPluginManager {
  list: () => Promise<RemoteResult<InventorySnapshotLike>>
  setEnabled: (entryId: string, enabled: boolean) => Promise<RemoteResult<{ snapshot: InventorySnapshotLike }>>
}

/** MCP 服务行投射。 */
export interface McpServerLike {
  id: string
  serverName: string
  transport: 'stdio' | 'streamable-http'
  command: string | null
  args: readonly string[]
  env: Readonly<Record<string, string>>
  cwd: string | null
  url: string | null
  headers: Readonly<Record<string, string>>
  toolCallTimeoutMs: number | null
  disabled: boolean
  managed: boolean
}

export interface McpServersSnapshotLike {
  profileName: string
  servers: readonly McpServerLike[]
}

/** 新增/更新 MCP 服务的提交输入。 */
export interface McpServerInputLike {
  serverName: string
  transport: 'stdio' | 'streamable-http'
  command: string | null
  args: readonly string[]
  env: Readonly<Record<string, string>>
  cwd: string | null
  url: string | null
  headers: Readonly<Record<string, string>>
  toolCallTimeoutMs: number | null
}

export interface McpReceiptLike {
  status: 'changed' | 'removed' | 'restart-required' | 'failed'
  message: string | null
  snapshot: McpServersSnapshotLike
}

/** 可选的 MCP 管家 remote 面（挂在 pluginManager 命名空间上，渲染时探测）。 */
export interface CodexMcpManager {
  listMcpServers: () => Promise<RemoteResult<McpServersSnapshotLike>>
  saveMcpServer: (input: McpServerInputLike, enabled: boolean) => Promise<RemoteResult<McpReceiptLike>>
  removeMcpServer: (serverName: string) => Promise<RemoteResult<McpReceiptLike>>
  setMcpServerEnabled: (serverName: string, enabled: boolean) => Promise<RemoteResult<McpReceiptLike>>
}

/** 技能条目投射。 */
export interface SkillLike {
  name: string
  directory: string
  description: string | null
  modelInvocable: boolean
  source: string
}

export interface SkillsSnapshotLike {
  skillsRoot: string
  skills: readonly SkillLike[]
}

export interface SkillReceiptLike {
  status: 'changed' | 'failed'
  message: string | null
  snapshot: SkillsSnapshotLike
}

/** 可选的 Skills 管家 remote 面（挂在 pluginManager 命名空间上，渲染时探测）。 */
export interface CodexSkillsManager {
  listSkills: () => Promise<RemoteResult<SkillsSnapshotLike>>
  setSkillModelInvocation: (skillName: string, enabled: boolean) => Promise<RemoteResult<SkillReceiptLike>>
}

/** 市场条目投射（与市场包的目录条目字段一致）。 */
export interface MarketEntryLike {
  id: string
  displayName: { 'zh-CN': string; en: string }
  summary: { 'zh-CN': string; en: string }
  packageName: string | null
  version: string | null
  category: string
  license: string | null
  availability: string
  installedVersion: string | null
  repositoryUrl: string
}

export interface MarketSnapshotLike {
  entries: readonly MarketEntryLike[]
}

/** 可选的市场 remote 面，渲染时探测。 */
export interface CodexMarketplace {
  list: (refresh: boolean) => Promise<RemoteResult<MarketSnapshotLike>>
  installPlugin: (packageName: string, version: string) => Promise<RemoteResult<unknown>>
}

/** 会话历史里的一条用户指令。 */
export interface CommandPrompt {
  seq: number
  text: string
}

export interface CodexPanelInjected {
  panel: PanelController
  meta: SessionMetaStore
  api: CodexApi
  pluginManager: CodexPluginManager | undefined
  marketplace: CodexMarketplace | undefined
  mcpManager: CodexMcpManager | undefined
  skillsManager: CodexSkillsManager | undefined
  history: (sessionId: SessionId) => Promise<readonly CommandPrompt[]>
  /** 同步宿主 details 列开合（layout.openDetails / closeDetails）。 */
  setColumnOpen: (open: boolean) => void
}

export interface CodexRightPanelProps extends CodexPanelInjected {
  useSessions: SelectorHook<SessionListStateLike>
  useWorkspaces: SelectorHook<WorkspaceSnapshotLike>
  t: TFn
}

export function CodexRightPanel({
  panel, meta, api, pluginManager, marketplace, mcpManager, skillsManager, history, setColumnOpen,
  useSessions, useWorkspaces, t,
}: CodexRightPanelProps) {
  const [state, controller] = usePanelState(panel)
  const currentId = useSessions(s => s.current)
  const sessionCwd = useSessions(s => (s.current === undefined ? undefined : s.byId[s.current]?.cwd))
  const workspaceId = useWorkspaces(s => (
    currentId === undefined ? undefined : s.items.find(workspace => workspace.sessionIds.includes(currentId))?.workspaceId
  ))

  // 挂载即同步列开合：覆盖首个会话出现与会话切换后框架自动收起两种情形
  // （会话作用域条目随切换重挂载；被动 effect 晚于框架布局 effect）。
  useEffect(() => {
    if (state.open) setColumnOpen(true)
  }, [])

  if (!state.open) return null

  const icon = (size = 15) => ({ size })
  const tabs: readonly TabBarTab[] = [
    { id: 'files', label: t('panelFiles'), icon: <Files {...icon()} /> },
    { id: 'git', label: t('panelGit'), icon: <GitBranch {...icon()} /> },
    { id: 'projects', label: t('panelProjects'), icon: <FolderTree {...icon()} /> },
    { id: 'plugins', label: t('panelPlugins'), icon: <Blocks {...icon()} /> },
    { id: 'mcp', label: t('panelMcp'), icon: <Server {...icon()} /> },
    { id: 'skills', label: t('panelSkills'), icon: <Sparkles {...icon()} /> },
    { id: 'commands', label: t('panelCommands'), icon: <Terminal {...icon()} /> },
    { id: 'summary', label: t('panelSummary'), icon: <StickyNote {...icon()} /> },
    { id: 'browser', label: t('panelBrowser'), icon: <Globe {...icon()} /> },
  ]

  const closePanel = (): void => {
    controller.close()
    setColumnOpen(false)
  }

  return (
    <aside className={css.panel} role="complementary" aria-label={t('panelTool')}>
      <TabBar
        tabs={tabs}
        activeId={state.tab}
        onSelect={tab => { controller.open(tab) }}
        onClose={closePanel}
        t={t}
      />
      <div className={css.panelBody}>
          {state.tab === 'files' && (
            <FilesPanel
              api={api}
              t={t}
              cwd={sessionCwd}
              workspaceTitle={t('workspaceFolder')}
              sessionId={currentId}
              meta={meta}
            />
          )}
          {state.tab === 'git' && <GitPanel api={api} t={t} cwd={sessionCwd} />}
          {state.tab === 'projects' && (
            <ProjectsPanel api={api} t={t} workspaceId={workspaceId} workspacePath={sessionCwd} />
          )}
          {state.tab === 'plugins' && (
            <PluginsPanel pluginManager={pluginManager} marketplace={marketplace} t={t} locale={t('localeId')} />
          )}
          {state.tab === 'mcp' && <McpPanel mcpManager={mcpManager} t={t} />}
          {state.tab === 'skills' && <SkillsPanel skillsManager={skillsManager} t={t} />}
          {state.tab === 'commands' && (
            <CommandsPanel history={history} sessionId={currentId} t={t} />
          )}
          {state.tab === 'summary' && <SummaryPanel meta={meta} sessionId={currentId} t={t} />}
          {state.tab === 'browser' && <BrowserPanel t={t} />}
      </div>
    </aside>
  )
}
