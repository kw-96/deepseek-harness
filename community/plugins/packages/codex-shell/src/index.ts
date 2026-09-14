/** Host service for the dsh-codex-shell bottom multi-tab terminal. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-terminal'
import type {} from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { TerminalSessionId } from '@deepseek-ai/dsh-terminal'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { mintUiTerminalName, terminalOrigin } from './host/terminal-identity.js'
import type {
  TerminalListResponse, TerminalOpenOptions, TerminalOpenResponse,
  TerminalReadResponse, TerminalSendResponse,
} from './types.js'

export type * from './types.js'

/** codexShell Remote: the bottom panel's PTY sessions for the live Agent. */
export class CodexShell extends TypertRemoteService {
  static inject = ['terminals', 'agents']

  constructor(ctx: Context) {
    super(ctx, 'codexShell')
  }

  private terminalOwner(sessionId: string) {
    const owner = this.ctx.agents.get(SessionId(sessionId))
    if (owner === undefined) throw new Error(`终端需要当前会话的 live Agent：${sessionId}`)
    return owner
  }

  private mintUiName(owner: ReturnType<CodexShell['terminalOwner']>, dialect: 'bash' | 'pwsh'): string {
    const taken = new Set(
      this.ctx.terminals.list(owner).map(item => item.name).filter((name): name is string => name !== undefined),
    )
    return mintUiTerminalName(taken, dialect)
  }

  /**
   * Open or reconnect one bottom-panel PTY for the live Agent.
   * @param sessionId - live Agent session id.
   * @param options - cwd, unique name, shell dialect, and initial size.
   */
  @Remote('terminalOpen')
  async terminalOpen(sessionId: string, options?: TerminalOpenOptions): Promise<TerminalOpenResponse> {
    const owner = this.terminalOwner(sessionId)
    const dialect = options?.shellDialect ?? (process.platform === 'win32' ? 'pwsh' : 'bash')
    const name = options?.name ?? this.mintUiName(owner, dialect)
    const existing = this.ctx.terminals.list(owner).find(item => item.name === name && item.status.kind === 'running')
    if (existing !== undefined) {
      return {
        terminalId: existing.sessionId,
        output: '',
        status: existing.status,
        ...(existing.name !== undefined ? { name: existing.name } : {}),
        origin: terminalOrigin(existing.name),
      }
    }
    const created = await this.ctx.terminals.spawn(owner, {
      type: 'shell',
      name,
      interaction: 'interactive',
      shellDialect: dialect,
      ...(options?.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options?.cols !== undefined ? { cols: options.cols } : {}),
      ...(options?.rows !== undefined ? { rows: options.rows } : {}),
    })
    return {
      terminalId: created.sessionId,
      output: created.motd,
      status: created.status,
      ...(created.name !== undefined ? { name: created.name } : {}),
      origin: terminalOrigin(created.name),
    }
  }

  /**
   * List owner-scoped PTY sessions for the bottom panel.
   * @param sessionId - live Agent session id.
   */
  @Remote('terminalList')
  async terminalList(sessionId: string): Promise<TerminalListResponse> {
    const owner = this.terminalOwner(sessionId)
    return {
      terminals: this.ctx.terminals.list(owner).map(item => ({
        terminalId: item.sessionId,
        ...(item.name !== undefined ? { name: item.name } : {}),
        status: item.status,
        origin: terminalOrigin(item.name),
      })),
    }
  }

  @Remote('terminalSend')
  async terminalSend(sessionId: string, terminalId: string, text: string): Promise<TerminalSendResponse> {
    const operation = this.ctx.terminals.startSend(this.terminalOwner(sessionId), TerminalSessionId(terminalId), { text, submit: true })
    const result = await operation.done
    return { output: result.viewport, status: result.sessionStatus, waitReason: result.waitReason, truncated: result.truncated }
  }

  /**
   * Stream interactive PTY output to the Web bottom panel (not session-logged).
   * @param sessionId - live Agent session id.
   * @param terminalId - owner-scoped PTY id.
   * @param signal - Remote stream carrier cancellation.
   * @returns decoded frames with CSI preserved.
   */
  @Remote({ mode: 'stream' })
  terminalFollow(
    sessionId: string,
    terminalId: string,
    signal: AbortSignal,
  ): AsyncIterable<{ seq: number; chunk: string }> {
    return this.ctx.terminals.followOutput(
      this.terminalOwner(sessionId),
      TerminalSessionId(terminalId),
      signal,
    )
  }

  @Remote('terminalWrite')
  async terminalWrite(sessionId: string, terminalId: string, data: string): Promise<{ ok: true }> {
    await this.ctx.terminals.write(this.terminalOwner(sessionId), TerminalSessionId(terminalId), data)
    return { ok: true }
  }

  @Remote('terminalResize')
  async terminalResize(
    sessionId: string,
    terminalId: string,
    cols: number,
    rows: number,
  ): Promise<{ ok: true }> {
    await this.ctx.terminals.resize(this.terminalOwner(sessionId), TerminalSessionId(terminalId), cols, rows)
    return { ok: true }
  }

  @Remote('terminalRead')
  async terminalRead(sessionId: string, terminalId: string): Promise<TerminalReadResponse> {
    const result = this.ctx.terminals.read(this.terminalOwner(sessionId), TerminalSessionId(terminalId), { count: 500 })
    return { output: result.text, truncated: result.truncated }
  }

  @Remote('terminalClose')
  async terminalClose(sessionId: string, terminalId: string): Promise<{ ok: true }> {
    await this.ctx.terminals.kill(this.terminalOwner(sessionId), TerminalSessionId(terminalId), 'bottom terminal closed')
    return { ok: true }
  }
}

export default CodexShell
