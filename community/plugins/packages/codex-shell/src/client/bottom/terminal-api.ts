/** 底部终端面板消费的 codexShell API 面。 */

/** 会话内一个终端会话的对外形态。 */
export interface TerminalView {
  terminalId: string
  name?: string
  status: { kind: string }
  origin: 'ui' | 'agent'
}

/** 新建终端会话的可选参数。 */
export interface TerminalOpenOptions {
  cwd?: string
  name?: string
  shellDialect?: 'bash' | 'pwsh'
  cols?: number
  rows?: number
}

export interface TerminalApi {
  terminalOpen: (sessionId: string, options?: TerminalOpenOptions) => Promise<TerminalView & { output: string }>
  terminalList: (sessionId: string) => Promise<{ terminals: readonly TerminalView[] }>
  terminalFollow: (sessionId: string, terminalId: string, signal?: AbortSignal) => AsyncIterable<{ seq: number; chunk: string }>
  terminalWrite: (sessionId: string, terminalId: string, data: string) => Promise<{ ok: true }>
  terminalResize: (sessionId: string, terminalId: string, cols: number, rows: number) => Promise<{ ok: true }>
  terminalRead: (sessionId: string, terminalId: string) => Promise<{ output: string; truncated: boolean }>
  terminalClose: (sessionId: string, terminalId: string) => Promise<{ ok: true }>
}
