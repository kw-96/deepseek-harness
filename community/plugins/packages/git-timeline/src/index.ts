/** Host half: the gitPanel Remote over ctx.shell (reads + explicit write actions). */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-shell'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  commit, fetch as fetchAll, pull, push, stage, stageAll, unstage, unstageAll,
} from './host/actions.js'
import { readLog } from './host/history.js'
import { generateCommitMessage } from './host/message.js'
import { readIdentity, readStatus } from './host/status.js'
import type {
  GitActionResponse, GitCommitResponse, GitIdentity, GitLogResponse, GitMessageResponse, GitStatusResponse,
} from './types.js'

export type * from './types.js'

/** gitPanel Remote: workspace status, history, write actions, and commit-message generation. */
export class GitPanel extends TypertRemoteService {
  static inject = ['shell']

  constructor(ctx: Context) {
    super(ctx, 'gitPanel')
  }

  /**
   * Working-tree status: branch/upstream, staged entries, and unstaged changes.
   * @param cwd - session working directory (any directory inside the repository).
   * @returns the repository identity, branch facts, and both entry groups.
   */
  @Remote('status')
  async status(cwd: string): Promise<GitStatusResponse> {
    return await readStatus(this.ctx.shell, cwd)
  }

  /**
   * Commit history with parent hashes for the graph.
   * @param cwd - session working directory.
   * @param limit - maximum commits (default 80).
   * @returns the commit list, or the read failure.
   */
  @Remote('log')
  async log(cwd: string, limit?: number): Promise<GitLogResponse> {
    return await readLog(this.ctx.shell, cwd, limit)
  }

  /**
   * Stage the given repository-relative paths.
   * @param cwd - session working directory.
   * @param paths - repository-relative paths.
   */
  @Remote('stage')
  async stage(cwd: string, paths: readonly string[]): Promise<GitActionResponse> {
    return await stage(this.ctx.shell, cwd, paths)
  }

  /**
   * Unstage the given repository-relative paths.
   * @param cwd - session working directory.
   * @param paths - repository-relative paths.
   */
  @Remote('unstage')
  async unstage(cwd: string, paths: readonly string[]): Promise<GitActionResponse> {
    return await unstage(this.ctx.shell, cwd, paths)
  }

  /**
   * Stage every change, including untracked files.
   * @param cwd - session working directory.
   */
  @Remote('stageAll')
  async stageAll(cwd: string): Promise<GitActionResponse> {
    return await stageAll(this.ctx.shell, cwd)
  }

  /**
   * Unstage every staged change.
   * @param cwd - session working directory.
   */
  @Remote('unstageAll')
  async unstageAll(cwd: string): Promise<GitActionResponse> {
    return await unstageAll(this.ctx.shell, cwd)
  }

  /**
   * Commit the staged changes.
   * @param cwd - session working directory.
   * @param message - commit message (non-empty).
   * @param amend - amend the previous commit instead of creating one.
   */
  @Remote('commit')
  async commit(cwd: string, message: string, amend: boolean): Promise<GitCommitResponse> {
    return await commit(this.ctx.shell, cwd, message, amend)
  }

  /**
   * Push the current branch.
   * @param cwd - session working directory.
   */
  @Remote('push')
  async push(cwd: string): Promise<GitActionResponse> {
    return await push(this.ctx.shell, cwd)
  }

  /**
   * Pull the current branch.
   * @param cwd - session working directory.
   */
  @Remote('pull')
  async pull(cwd: string): Promise<GitActionResponse> {
    return await pull(this.ctx.shell, cwd)
  }

  /**
   * Fetch every remote and prune stale refs.
   * @param cwd - session working directory.
   */
  @Remote('fetch')
  async fetch(cwd: string): Promise<GitActionResponse> {
    return await fetchAll(this.ctx.shell, cwd)
  }

  /**
   * The signing identity behind commits (the panel's account display).
   * @param cwd - session working directory.
   */
  @Remote('identity')
  async identity(cwd: string): Promise<GitIdentity> {
    return await readIdentity(this.ctx.shell, cwd)
  }

  /**
   * Draft a commit message with the session's own model route.
   * @param sessionId - the session whose model route is used.
   * @param cwd - session working directory.
   * @returns the drafted message plus the provider/model that produced it.
   */
  @Remote('message')
  async message(sessionId: string, cwd: string): Promise<GitMessageResponse> {
    return await generateCommitMessage(this.ctx, this.ctx.shell, sessionId, cwd)
  }
}

export default GitPanel
