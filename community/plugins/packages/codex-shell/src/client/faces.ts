/**
 * Local structural faces for the 0.1.2 harness client seams this plugin rides.
 * The published client type lines moved faster than community plugins, so the
 * plugin compiles against minimal structural contracts instead of the volatile
 * SlotMap merges. Runtime names are still validated fail-loud by the harness
 * slot core.
 */

export type SessionId = string

/** Minimal durable session row the bottom panel reads (cwd of the current session). */
export interface SessionSummaryLike {
  id: SessionId
  displayTitle: string
  cwd?: string
  running: boolean
  blank: boolean
  updatedAt: number
}

export interface SessionListStateLike {
  ids: readonly SessionId[]
  byId: Readonly<Record<SessionId, SessionSummaryLike>>
  current: SessionId | undefined
  phase: string
}

/** Snapshot-selector hook shape the framework injects (useSessions). */
export type SelectorHook<S> = <T>(selector: (state: S) => T) => T

export type RemoteOk<T> = { ok: true; value: T }
export type RemoteErr = { ok: false; error: { code: string; message: string } }
export type RemoteResult<T> = RemoteOk<T> | RemoteErr

/** codexShell remote namespace face (mounted by this plugin's own contribution). */
export interface CodexShellRemoteFace {
  terminalOpen(sessionId: string, options?: {
    cwd?: string
    name?: string
    shellDialect?: 'bash' | 'pwsh'
    cols?: number
    rows?: number
  }): Promise<RemoteResult<{
    terminalId: string
    output: string
    status: { kind: string }
    name?: string
    origin: 'ui' | 'agent'
  }>>
  terminalList(sessionId: string): Promise<RemoteResult<{
    terminals: readonly {
      terminalId: string
      name?: string
      status: { kind: string }
      origin: 'ui' | 'agent'
    }[]
  }>>
  terminalFollow(sessionId: string, terminalId: string, signal?: AbortSignal): AsyncIterable<{ seq: number; chunk: string }>
  terminalWrite(sessionId: string, terminalId: string, data: string): Promise<RemoteResult<{ ok: true }>>
  terminalResize(sessionId: string, terminalId: string, cols: number, rows: number): Promise<RemoteResult<{ ok: true }>>
  terminalRead(sessionId: string, terminalId: string): Promise<RemoteResult<{ output: string; truncated: boolean }>>
  terminalClose(sessionId: string, terminalId: string): Promise<RemoteResult<{ ok: true }>>
}

/** Typert client remote face the gateway provides. */
export interface RemoteFace {
  $mount(contribution: unknown): Promise<() => Promise<void>>
  codexShell: CodexShellRemoteFace
}

/** Locale face: namespace registration and typed bind. */
export interface LocaleFace {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
}

export type SlotSpecLike = { kind: 'single' | 'list'; scope: 'root' | 'session' | 'session-maybe' }

/** Registration options this plugin passes to slots.register. */
export interface RegisterOptionsLike {
  name: string
  id?: string
  order?: number
  priority?: number
  locale?: string
  label?: () => string
  children?: Record<string, SlotSpecLike>
  inject?: () => object
}

/** The slots service face, structurally. */
export interface SlotsFace {
  inject(key: string, callback: () => (() => void) | void): () => void
  register(options: RegisterOptionsLike, component: unknown): () => void
  entries(key: string): readonly unknown[]
  subscribe(key: string, listener: () => void): () => void
}

/** 宿主 ui-layout 的 ctx.layout 面板动作面：驱动底部行开合。 */
export interface LayoutFace {
  openBottom(): void
  closeBottom(): void
}

export type TFn = (key: string, params?: Record<string, unknown>) => string
