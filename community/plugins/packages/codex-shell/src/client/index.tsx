/**
 * Browser entry for dsh-codex-shell: mounts the codexShell Remote and
 * registers the Codex-styled sidebar browser, the right-edge panel overlay,
 * and the conversation-header toggle.
 *
 * Compiles against local structural faces (see faces.ts) instead of the
 * harness client type lines, which move faster than community plugins; the
 * runtime slot core still validates every name fail-loud at load.
 */
import type { Context } from '@deepseek-ai/cordis'
import remoteContribution from 'dsh-codex-shell/remote'
import { SessionMetaStore } from './session-meta.js'
import { CodexBrowser, type CodexBrowserInjected } from './WorkspaceBrowser.js'
import { CodexRightPanel, type CodexPanelInjected, type CommandPrompt } from './RightPanel.js'
import { PanelToggle, type PanelToggleInjected } from './PanelToggle.js'
import { PanelController } from './panel-controller.js'
import { en, zh } from './locales.js'
import type {
  CodexShellRemoteFace, HostObservableLike, LocaleFace, RemoteFace, SessionsFace, SlotsFace, TFn, WorkspacesFace,
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

/** Durable user prompts for one session; absent or failing transport yields none. */
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
 * Mount the Remote contribution and register all codex-shell surfaces.
 * @param ctx - Client root context.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const remote = ctx.get('remote') as RemoteFace
  const locale = ctx.get('locale') as LocaleFace
  const slots = ctx.get('slots') as SlotsFace
  const sessions = ctx.get('sessions') as SessionsFace
  const workspaces = ctx.get('workspaces') as WorkspacesFace
  const connection = ctx.get('connection')

  const disposeRemote = await remote.$mount(remoteContribution)
  const disposeLocale = locale.register('codex-shell', { zh, en } as Record<string, Record<string, string>>)
  const t: TFn = locale.bind('codex-shell')

  const panel = new PanelController()
  const meta = new SessionMetaStore()

  ctx.effect(() => () => { panel.dispose() }, 'codex-shell: panel controller')

  const codexRemote = ctx.get('remote.codexShell') as CodexShellRemoteFace
  const pluginManager = probeRemote(ctx, 'pluginManager') as CodexPanelInjected['pluginManager']
  const marketplace = probeRemote(ctx, 'marketplace') as CodexPanelInjected['marketplace']

  const browserFlowSource = (hole: string): HostObservableLike<boolean> => ({
    getSnapshot: () => slots.entries(hole).length > 0,
    subscribe: listener => slots.subscribe(hole, listener),
  })

  const browserInject = (): CodexBrowserInjected => ({
    hooks: {
      directoryFlow: browserFlowSource('sidebar.workspaces.directoryFlow'),
      hostInfo: {
        getSnapshot: () => (remote as unknown as { $host?: unknown }).$host,
        subscribe: listener => (ctx.on as (event: string, listener: () => void) => () => void)('connection/reset', listener),
      },
    },
    startSession: (workspaceId?: string) => {
      sessions.create(workspaceId === undefined ? {} : { workspaceId })
        .then(sessionId => { sessions.open(sessionId) })
        .catch(() => { /* create failure leaves the current selection */ })
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
        .catch(() => { /* fork failure leaves the current selection */ })
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
    createWorkspace: input => workspaces.create(input),
    meta,
  })

  const panelInject = (): CodexPanelInjected => ({
    panel,
    meta,
    api: {
      fsList: async path => unwrap(await codexRemote.fsList(path)),
      fsRead: async (path, maxBytes) => unwrap(await codexRemote.fsRead(path, maxBytes)),
      fsWrite: async (path, content) => unwrap(await codexRemote.fsWrite(path, content)),
      fsSearchName: async (root, query) => unwrap(await codexRemote.fsSearchName(root, query)),
      fsSearchContent: async (root, query) => unwrap(await codexRemote.fsSearchContent(root, query)),
      gitStatus: async cwd => unwrap(await codexRemote.gitStatus(cwd)),
      gitLog: async (cwd, count) => unwrap(await codexRemote.gitLog(cwd, count)),
      gitDiff: async (cwd, path, staged) => unwrap(await codexRemote.gitDiff(cwd, path, staged)),
      gitStage: async (cwd, path) => unwrap(await codexRemote.gitStage(cwd, path)),
      gitUnstage: async (cwd, path) => unwrap(await codexRemote.gitUnstage(cwd, path)),
      gitDiscard: async (cwd, path) => unwrap(await codexRemote.gitDiscard(cwd, path)),
      gitCommit: async (cwd, message) => unwrap(await codexRemote.gitCommit(cwd, message)),
      gitBranches: async cwd => unwrap(await codexRemote.gitBranches(cwd)),
      gitCheckout: async (cwd, branch) => unwrap(await codexRemote.gitCheckout(cwd, branch)),
      projectDirs: async workspaceId => unwrap(await codexRemote.projectDirs(workspaceId)),
      projectSetDirs: async (workspaceId, dirs) => unwrap(await codexRemote.projectSetDirs(workspaceId, dirs)),
      projectAddDir: async (workspaceId, path) => unwrap(await codexRemote.projectAddDir(workspaceId, path)),
    },
    pluginManager,
    marketplace,
    history: sessionId => readPrompts(connection, sessionId),
  })

  const toggleInject = (): PanelToggleInjected => ({ panel, meta })

  // Each registration waits on its declaration through slots.inject: owner
  // apply order is unconstrained, and the shipped owners declare these holes.
  // NOTE: no `children` here — the shipped WorkspaceBrowser already declares
  // 'sidebar.workspaces.directoryFlow' and shadowing does not collapse that
  // declaration, so redeclaring it would throw at load.
  const disposeBrowser = slots.inject('sidebar.workspaces', () => slots.register({
    name: 'sidebar.workspaces',
    priority: -1,
    locale: 'codex-shell',
    inject: browserInject,
  }, CodexBrowser))
  const disposePanel = slots.inject('shell.overlay', () => slots.register({
    name: 'shell.overlay', id: 'codex-panel', order: 0, locale: 'codex-shell',
    inject: panelInject,
  }, CodexRightPanel))
  const disposeToggle = slots.inject('conversation.session.header.utilities', () => slots.register({
    name: 'conversation.session.header.utilities', id: 'codex-panel-toggle', order: 20,
    label: () => t('openRightPanel'), locale: 'codex-shell',
    inject: toggleInject,
  }, PanelToggle))

  return async () => {
    disposeToggle()
    disposePanel()
    disposeBrowser()
    disposeLocale()
    await disposeRemote()
  }
}

/** Access one optional remote namespace (plugin-manager / marketplace bundles). */
function probeRemote(ctx: Context, name: string): unknown {
  return ctx.get(`remote.${name}`)
}
