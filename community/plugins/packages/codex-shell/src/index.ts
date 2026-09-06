/** Host service for the dsh-codex-shell integrated Codex-style workspace shell. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-shell'
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
  ProjectAddDirResponse, ProjectDirsResponse,
} from './types.js'

export type * from './types.js'

/** codexShell Remote: filesystem, git, and per-workspace project directories for the Web shell. */
export class CodexShell extends TypertRemoteService {
  static inject = ['fs', 'shell']

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
