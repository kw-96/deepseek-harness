/** Host service for the dsh-codex-shell integrated Codex-style workspace shell. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-terminal'
import type {} from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { TerminalSessionId } from '@deepseek-ai/dsh-terminal'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  gitBranches, gitCheckout, gitCommit, gitDiff, gitDiscard, gitFetch, gitLog, gitPull, gitPush, gitStage,
  gitStageAll, gitStatus, gitUnstage, gitUnstageAll,
  searchContent,
} from './host/gitops.js'
import { listDirectory, readTextFile, searchNames, writeTextFile } from './host/fsops.js'
import { projectAddDir, projectDirs, projectSetDirs } from './host/projects.js'
import type {
  FsContentSearchResponse, FsListResponse, FsNameSearchResponse, FsReadResponse,
  GitBranchesResponse, GitDiffResponse, GitLogResponse, GitStatusResponse,
  ProjectAddDirResponse, ProjectDirsResponse, TerminalOpenResponse, TerminalReadResponse, TerminalSendResponse,
} from './types.js'

export type * from './types.js'

/** codexShell Remote: filesystem, git, and per-workspace project directories for the Web shell. */
export class CodexShell extends TypertRemoteService {
  static inject = ['fs', 'shell', 'terminals', 'agents']

  constructor(ctx: Context) {
    super(ctx, 'codexShell')
  }

  @Remote('fsList')
  async fsList(path: string): Promise<FsListResponse> {
    return await listDirectory(this.ctx.fs, path)
  }

  @Remote('fsRead')
  async fsRead(path: string, maxBytes?: number): Promise<FsReadResponse> {
    return await readTextFile(this.ctx.fs, path, maxBytes)
  }

  @Remote('fsWrite')
  async fsWrite(path: string, content: string): Promise<{ ok: true }> {
    return await writeTextFile(this.ctx.fs, path, content)
  }

  @Remote('fsSearchName')
  async fsSearchName(root: string, query: string): Promise<FsNameSearchResponse> {
    return await searchNames(this.ctx.fs, root, query)
  }

  @Remote('fsSearchContent')
  async fsSearchContent(root: string, query: string): Promise<FsContentSearchResponse> {
    return await searchContent(this.ctx.shell, root, query)
  }

  @Remote('gitStatus')
  async gitStatus(cwd: string): Promise<GitStatusResponse> {
    return await gitStatus(this.ctx.shell, cwd)
  }

  @Remote('gitLog')
  async gitLog(cwd: string, count?: number): Promise<GitLogResponse> {
    return await gitLog(this.ctx.shell, cwd, count)
  }

  @Remote('gitDiff')
  async gitDiff(cwd: string, path?: string, staged?: boolean): Promise<GitDiffResponse> {
    return await gitDiff(this.ctx.shell, cwd, path, staged)
  }

  @Remote('gitStage')
  async gitStage(cwd: string, path?: string): Promise<{ ok: true }> {
    return await gitStage(this.ctx.shell, cwd, path)
  }

  @Remote('gitUnstage')
  async gitUnstage(cwd: string, path?: string): Promise<{ ok: true }> {
    return await gitUnstage(this.ctx.shell, cwd, path)
  }

  @Remote('gitDiscard')
  async gitDiscard(cwd: string, path: string): Promise<{ ok: true }> {
    return await gitDiscard(this.ctx.shell, cwd, path)
  }

  @Remote('gitCommit')
  async gitCommit(cwd: string, message: string): Promise<{ ok: true }> {
    return await gitCommit(this.ctx.shell, cwd, message)
  }

  @Remote('gitBranches')
  async gitBranches(cwd: string): Promise<GitBranchesResponse> {
    return await gitBranches(this.ctx.shell, cwd)
  }

  @Remote('gitCheckout')
  async gitCheckout(cwd: string, branch: string): Promise<{ ok: true }> {
    return await gitCheckout(this.ctx.shell, cwd, branch)
  }

  @Remote('gitFetch')
  async gitFetch(cwd: string): Promise<{ ok: true }> {
    return await gitFetch(this.ctx.shell, cwd)
  }

  @Remote('gitPull')
  async gitPull(cwd: string): Promise<{ ok: true }> {
    return await gitPull(this.ctx.shell, cwd)
  }

  @Remote('gitPush')
  async gitPush(cwd: string): Promise<{ ok: true }> {
    return await gitPush(this.ctx.shell, cwd)
  }

  @Remote('gitStageAll')
  async gitStageAll(cwd: string): Promise<{ ok: true }> {
    return await gitStageAll(this.ctx.shell, cwd)
  }

  @Remote('gitUnstageAll')
  async gitUnstageAll(cwd: string): Promise<{ ok: true }> {
    return await gitUnstageAll(this.ctx.shell, cwd)
  }

  private terminalOwner(sessionId: string) {
    const owner = this.ctx.agents.get(SessionId(sessionId))
    if (owner === undefined) throw new Error(`终端需要当前会话的 live Agent：${sessionId}`)
    return owner
  }

  @Remote('terminalOpen')
  async terminalOpen(sessionId: string, cwd?: string): Promise<TerminalOpenResponse> {
    const owner = this.terminalOwner(sessionId)
    const existing = this.ctx.terminals.list(owner).find(item => item.name === 'codex-bottom' && item.status.kind === 'running')
    if (existing !== undefined) {
      const output = this.ctx.terminals.read(owner, existing.sessionId, { count: 500 })
      return { terminalId: existing.sessionId, output: output.text, status: existing.status }
    }
    const created = await this.ctx.terminals.spawn(owner, { type: 'shell', name: 'codex-bottom', ...(cwd !== undefined ? { cwd } : {}) })
    return { terminalId: created.sessionId, output: created.motd, status: created.status }
  }

  @Remote('terminalSend')
  async terminalSend(sessionId: string, terminalId: string, text: string): Promise<TerminalSendResponse> {
    const operation = this.ctx.terminals.startSend(this.terminalOwner(sessionId), TerminalSessionId(terminalId), { text, submit: true })
    const result = await operation.done
    return { output: result.viewport, status: result.sessionStatus, waitReason: result.waitReason, truncated: result.truncated }
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

  @Remote('projectDirs')
  async projectDirs(workspaceId: string): Promise<ProjectDirsResponse> {
    return await projectDirs(this.ctx.fs, workspaceId)
  }

  @Remote('projectSetDirs')
  async projectSetDirs(workspaceId: string, dirs: readonly string[]): Promise<ProjectDirsResponse> {
    return await projectSetDirs(this.ctx.fs, workspaceId, dirs)
  }

  @Remote('projectAddDir')
  async projectAddDir(workspaceId: string, path: string): Promise<ProjectAddDirResponse> {
    return await projectAddDir(this.ctx.fs, workspaceId, path)
  }
}

export default CodexShell
