/**
 * Right-edge Codex panel (shell.overlay occupant): tabbed files/git/projects/
 * plugins/commands/summary/browser surface, floating over the conversation.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { X, Files, GitBranch, FolderTree, Blocks, Terminal, StickyNote, Globe } from 'lucide-react'
import type {
  FsContentSearchResponse, FsListResponse, FsNameSearchResponse, FsReadResponse,
  GitBranchesResponse, GitDiffResponse, GitLogResponse, GitStatusResponse,
  ProjectAddDirResponse, ProjectDirsResponse,
} from 'dsh-codex-shell/types'
import type { SessionMetaStore } from './session-meta.js'
import { PanelController, usePanelState, type PanelKind } from './panel-controller.js'
import type { SelectorHook, SessionId, SessionListStateLike, TFn, WorkspaceSnapshotLike } from './faces.js'
import { FilesPanel } from './panels/FilesPanel.js'
import { GitPanel } from './panels/GitPanel.js'
import { ProjectsPanel } from './panels/ProjectsPanel.js'
import { PluginsPanel } from './panels/PluginsPanel.js'
import { CommandsPanel } from './panels/CommandsPanel.js'
import { SummaryPanel } from './panels/SummaryPanel.js'
import { BrowserPanel } from './panels/BrowserPanel.js'
import css from './styles.module.css'

/** Host-facing API surface the panel tabs consume. */
export interface CodexApi {
  fsList: (path: string) => Promise<FsListResponse>
  fsRead: (path: string, maxBytes?: number) => Promise<FsReadResponse>
  fsWrite: (path: string, content: string) => Promise<{ ok: true }>
  fsSearchName: (root: string, query: string) => Promise<FsNameSearchResponse>
  fsSearchContent: (root: string, query: string) => Promise<FsContentSearchResponse>
  gitStatus: (cwd: string) => Promise<GitStatusResponse>
  gitLog: (cwd: string, count?: number) => Promise<GitLogResponse>
  gitDiff: (cwd: string, path?: string, staged?: boolean) => Promise<GitDiffResponse>
  gitStage: (cwd: string, path?: string) => Promise<{ ok: true }>
  gitUnstage: (cwd: string, path?: string) => Promise<{ ok: true }>
  gitDiscard: (cwd: string, path: string) => Promise<{ ok: true }>
  gitCommit: (cwd: string, message: string) => Promise<{ ok: true }>
  gitBranches: (cwd: string) => Promise<GitBranchesResponse>
  gitCheckout: (cwd: string, branch: string) => Promise<{ ok: true }>
  projectDirs: (workspaceId: string) => Promise<ProjectDirsResponse>
  projectSetDirs: (workspaceId: string, dirs: readonly string[]) => Promise<ProjectDirsResponse>
  projectAddDir: (workspaceId: string, path: string) => Promise<ProjectAddDirResponse>
}

/** One inventory row projected from the plugin-manager remote. */
export interface InventoryEntryLike {
  entryId: string
  packageName: string
  category: string
  description: string | null
  enabled: boolean
  protected: boolean
  protectionReason: string | null
}

export interface InventorySnapshotLike {
  entries: readonly InventoryEntryLike[]
}

/** Optional plugin-manager bundle face, probed at render time. */
export interface CodexPluginManager {
  list: () => Promise<RemoteResult<InventorySnapshotLike>>
  setEnabled: (entryId: string, enabled: boolean) => Promise<RemoteResult<{ snapshot: InventorySnapshotLike }>>
}

/** One installable market entry projected from the marketplace remote. */
export interface MarketEntryLike {
  displayName: { 'zh-CN': string; en: string }
  packageName: string | null
  version: string | null
  availability: string
}

export interface MarketSnapshotLike {
  entries: readonly MarketEntryLike[]
}

/** Optional marketplace bundle face, probed at render time. */
export interface CodexMarketplace {
  list: (refresh: boolean) => Promise<RemoteResult<MarketSnapshotLike>>
  installPlugin: (packageName: string, version: string) => Promise<RemoteResult<unknown>>
}

/** One durable user prompt pulled from the session history. */
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
  history: (sessionId: SessionId) => Promise<readonly CommandPrompt[]>
}

export interface CodexRightPanelProps extends CodexPanelInjected {
  useSessions: SelectorHook<SessionListStateLike>
  useWorkspaces: SelectorHook<WorkspaceSnapshotLike>
  t: TFn
}

interface TabSpec {
  id: PanelKind
  label: string
  icon: React.ReactNode
}

export function CodexRightPanel({
  panel, meta, api, pluginManager, marketplace, history, useSessions, useWorkspaces, t,
}: CodexRightPanelProps) {
  const [state, controller] = usePanelState(panel)
  const currentId = useSessions(s => s.current)
  const sessionCwd = useSessions(s => (s.current === undefined ? undefined : s.byId[s.current]?.cwd))
  const workspaceId = useWorkspaces(s => {
    if (currentId === undefined) return undefined
    for (const workspace of s.items) {
      if (workspace.sessionIds.includes(currentId)) return workspace.workspaceId
    }
    return undefined
  })

  if (!state.open) return null

  const icon = (size = 15) => ({ size })
  const tabs: readonly TabSpec[] = [
    { id: 'files', label: t('panelFiles'), icon: <Files {...icon()} /> },
    { id: 'git', label: t('panelGit'), icon: <GitBranch {...icon()} /> },
    { id: 'projects', label: t('panelProjects'), icon: <FolderTree {...icon()} /> },
    { id: 'plugins', label: t('panelPlugins'), icon: <Blocks {...icon()} /> },
    { id: 'commands', label: t('panelCommands'), icon: <Terminal {...icon()} /> },
    { id: 'summary', label: t('panelSummary'), icon: <StickyNote {...icon()} /> },
    { id: 'browser', label: t('panelBrowser'), icon: <Globe {...icon()} /> },
  ]

  const activeLabel = tabs.find(tab => tab.id === state.tab)?.label ?? ''

  return (
    <aside className={css.panel} role="complementary">
      <nav className={css.tabRail} aria-label={t('panelTool')}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={state.tab === tab.id ? css.tabActive : css.tab}
            title={tab.label}
            aria-label={tab.label}
            aria-current={state.tab === tab.id ? 'true' : undefined}
            onClick={() => { controller.open(tab.id) }}
          >
            {tab.icon}
          </button>
        ))}
        <button type="button" className={`${css.tab} ${css.railEnd}`} title={t('closePanel')}
          aria-label={t('closePanel')}
          onClick={() => { controller.close() }}>
          <X size={15} />
        </button>
      </nav>
      <div className={css.workbench}>
        <div className={css.panelHeader}>
          <span className={css.panelTitle}>{activeLabel}</span>
        </div>
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
            <PluginsPanel pluginManager={pluginManager} marketplace={marketplace} t={t} />
          )}
          {state.tab === 'commands' && (
            <CommandsPanel history={history} sessionId={currentId} t={t} />
          )}
          {state.tab === 'summary' && <SummaryPanel meta={meta} sessionId={currentId} t={t} />}
          {state.tab === 'browser' && <BrowserPanel t={t} />}
        </div>
      </div>
    </aside>
  )
}
