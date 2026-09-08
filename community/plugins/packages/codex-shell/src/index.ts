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
import { mintUiTerminalName, terminalOrigin } from './host/terminal-identity.js'
import type {
  FsContentSearchResponse, FsListResponse, FsNameSearchResponse, FsReadResponse, FsSearchOptions,
  GitBranchesResponse, GitDiffResponse, GitLogResponse, GitStatusResponse,
  ProjectAddDirResponse, ProjectCreateRequest, ProjectDeleteRequest, ProjectDeleteResponse, ProjectDirsResponse,
  ProjectListResponse, ProjectRenameRequest, ProjectSetRootsRequest, ProjectValue, ProjectView,
  TerminalListResponse, TerminalOpenOptions, TerminalOpenResponse,
  TerminalReadResponse, TerminalSendResponse,
} from './types.js'

export type * from './types.js'

/** Structural face of `ctx.workspaceRegistry` project tier (avoids full import). */
interface ProjectEntityLike {
  readonly id: unknown
  readonly name: string
  readonly roots: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  setName(name: string): Promise<void>
  setRoots(roots: readonly string[]): Promise<void>
}

interface ProjectRegistryFace {
  listProjects(): Array<ProjectEntityLike>
  getProject(id: string): ProjectEntityLike | undefined
  createProject(name: string, roots: readonly string[]): Promise<ProjectEntityLike>
  deleteProject(id: string): Promise<boolean>
}

/** codexShell Remote: filesystem, git, and per-workspace project directories for the Web shell. */
export class CodexShell extends TypertRemoteService {
  static inject = ['fs', 'shell', 'terminals', 'agents', 'workspaceRegistry']

  constructor(ctx: Context) {
    super(ctx, 'codexShell')
  }

  private projectRegistry(): ProjectRegistryFace {
    const registry = this.ctx.get('workspaceRegistry') as ProjectRegistryFace | undefined
    if (registry === undefined) throw new Error('工作区注册表未挂载')
    return registry
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
  async fsSearchName(root: string, query: string, options?: FsSearchOptions): Promise<FsNameSearchResponse> {
    return await searchNames(this.ctx.fs, root, query, options)
  }

  @Remote('fsSearchContent')
  async fsSearchContent(root: string, query: string, options?: FsSearchOptions): Promise<FsContentSearchResponse> {
    return await searchContent(this.ctx.shell, root, query, options)
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

  @Remote('projectList')
  projectList(): Promise<ProjectListResponse> {
    return Promise.resolve({
      projects: this.projectRegistry().listProjects().map(projectView),
    })
  }

  @Remote('projectCreate')
  async projectCreate(request: ProjectCreateRequest): Promise<ProjectValue> {
    const name = request.name.trim()
    if (name === '') throw new Error('项目名称不能为空')
    return { project: projectView(await this.projectRegistry().createProject(name, request.roots ?? [])) }
  }

  @Remote('projectRename')
  async projectRename(request: ProjectRenameRequest): Promise<ProjectValue> {
    const project = this.projectRegistry().getProject(request.projectId)
    if (project === undefined) throw new Error(`未知项目 ${request.projectId}`)
    const name = request.name.trim()
    if (name === '') throw new Error('项目名称不能为空')
    await project.setName(name)
    return { project: projectView(project) }
  }

  @Remote('projectSetRoots')
  async projectSetRoots(request: ProjectSetRootsRequest): Promise<ProjectValue> {
    const project = this.projectRegistry().getProject(request.projectId)
    if (project === undefined) throw new Error(`未知项目 ${request.projectId}`)
    await project.setRoots(request.roots)
    return { project: projectView(project) }
  }

  @Remote('projectDelete')
  async projectDelete(request: ProjectDeleteRequest): Promise<ProjectDeleteResponse> {
    return { deleted: await this.projectRegistry().deleteProject(request.projectId) }
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

/** Project one registry entity into its Remote value. */
function projectView(project: ProjectEntityLike): ProjectView {
  return {
    projectId: String(project.id),
    name: project.name,
    roots: [...project.roots],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

export default CodexShell
