/** Host half: the gitPanel Remote over ctx.shell (reads + explicit write actions). */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-shell'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  commit, discard, fetch as fetchAll, pull, push, stage, stageAll, unstage, unstageAll,
} from './host/actions.js'
import { readCommit, readLastMessage, readLog } from './host/history.js'
import { checkout, createBranch, readBranches } from './host/branches.js'
import { generateCommitMessage } from './host/message.js'
import { readCommitDiff, readDiff, readIdentity, readStatus } from './host/status.js'
import type {
  GitActionResponse, GitBranches, GitCommitDetail, GitCommitResponse, GitDiffResponse, GitIdentity,
  GitLogResponse, GitMessageResponse, GitMessageText, GitStatusResponse,
} from './types.js'

export type * from './types.js'

/** gitPanel Remote: workspace status, history, write actions, and commit-message generation. */
export class GitPanel extends TypertRemoteService {
  static inject = ['shell']

  constructor(ctx: Context) {
    super(ctx, 'gitPanel')
  }

  /** Working-tree status: branch/upstream facts plus the staged and unstaged entry groups. */
  @Remote('status')
  async status(cwd: string): Promise<GitStatusResponse> {
    return await readStatus(this.ctx.shell, cwd)
  }

  /** Commit history with parent hashes, for the graph (limit defaults to 80). */
  @Remote('log')
  async log(cwd: string, limit?: number): Promise<GitLogResponse> {
    return await readLog(this.ctx.shell, cwd, limit)
  }

  /** One file's diff, from the index side when `staged` is set, otherwise the worktree side. */
  @Remote('diff')
  async diff(cwd: string, path: string, staged: boolean): Promise<GitDiffResponse> {
    return await readDiff(this.ctx.shell, cwd, { paths: [path], staged, maxBytes: 256 * 1024 })
  }

  /** One commit's metadata and changed files, for the graph row's detail. */
  @Remote('show')
  async show(cwd: string, hash: string): Promise<GitCommitDetail> {
    return await readCommit(this.ctx.shell, cwd, hash)
  }

  /** One file's diff inside one commit, for the detail row's expansion. */
  @Remote('showFile')
  async showFile(cwd: string, hash: string, path: string): Promise<GitDiffResponse> {
    return await readCommitDiff(this.ctx.shell, cwd, hash, path)
  }

  /** Local branches, most recently committed first. */
  @Remote('branches')
  async branches(cwd: string): Promise<GitBranches> {
    return await readBranches(this.ctx.shell, cwd)
  }

  /** Switch to an existing local branch. */
  @Remote('checkout')
  async checkout(cwd: string, branch: string): Promise<GitActionResponse> {
    return await checkout(this.ctx.shell, cwd, branch)
  }

  /** Create a branch from HEAD and switch to it (name validated by `git check-ref-format`). */
  @Remote('createBranch')
  async createBranch(cwd: string, name: string): Promise<GitActionResponse> {
    return await createBranch(this.ctx.shell, cwd, name)
  }

  /** The previous commit's full message, used to prefill an amend. */
  @Remote('lastMessage')
  async lastMessage(cwd: string): Promise<GitMessageText> {
    return await readLastMessage(this.ctx.shell, cwd)
  }

  /** Discard the worktree changes of the given tracked paths. */
  @Remote('discard')
  async discard(cwd: string, paths: readonly string[]): Promise<GitActionResponse> {
    return await discard(this.ctx.shell, cwd, paths)
  }

  /** Stage the given repository-relative paths. */
  @Remote('stage')
  async stage(cwd: string, paths: readonly string[]): Promise<GitActionResponse> {
    return await stage(this.ctx.shell, cwd, paths)
  }

  /** Unstage the given repository-relative paths. */
  @Remote('unstage')
  async unstage(cwd: string, paths: readonly string[]): Promise<GitActionResponse> {
    return await unstage(this.ctx.shell, cwd, paths)
  }

  /** Stage every change, including untracked files. */
  @Remote('stageAll')
  async stageAll(cwd: string): Promise<GitActionResponse> {
    return await stageAll(this.ctx.shell, cwd)
  }

  /** Unstage every staged change. */
  @Remote('unstageAll')
  async unstageAll(cwd: string): Promise<GitActionResponse> {
    return await unstageAll(this.ctx.shell, cwd)
  }

  /** Commit the staged changes; `amend` replaces the previous commit (message must be non-empty). */
  @Remote('commit')
  async commit(cwd: string, message: string, amend: boolean): Promise<GitCommitResponse> {
    return await commit(this.ctx.shell, cwd, message, amend)
  }

  /** Push the current branch. */
  @Remote('push')
  async push(cwd: string): Promise<GitActionResponse> {
    return await push(this.ctx.shell, cwd)
  }

  /** Pull the current branch. */
  @Remote('pull')
  async pull(cwd: string): Promise<GitActionResponse> {
    return await pull(this.ctx.shell, cwd)
  }

  /** Fetch every remote and prune stale refs. */
  @Remote('fetch')
  async fetch(cwd: string): Promise<GitActionResponse> {
    return await fetchAll(this.ctx.shell, cwd)
  }

  /** The signing identity behind commits (the panel's account display). */
  @Remote('identity')
  async identity(cwd: string): Promise<GitIdentity> {
    return await readIdentity(this.ctx.shell, cwd)
  }

  /** Draft a commit message with the session's own model route. */
  @Remote('message')
  async message(sessionId: string, cwd: string): Promise<GitMessageResponse> {
    return await generateCommitMessage(this.ctx, this.ctx.shell, sessionId, cwd)
  }
}

export default GitPanel
