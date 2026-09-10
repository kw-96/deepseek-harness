/** Host half: the gitTimeline Remote over ctx.shell (read-only git queries). */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-shell'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { readChanged, readLog } from './host/git.js'
import type { ChangedResponse, GitLogResponse } from './types.js'

export type * from './types.js'

/** gitTimeline Remote: per-file commit history and the workspace's changed files. */
export class GitTimeline extends TypertRemoteService {
  static inject = ['shell']

  constructor(ctx: Context) {
    super(ctx, 'gitTimeline')
  }

  /**
   * Recent commits, optionally limited to one file.
   * @param cwd - session working directory (any directory inside the repository).
   * @param path - file path to filter by (repository-relative or absolute).
   * @param count - maximum entries.
   * @returns the repository identity, the commit list, or the read failure.
   */
  @Remote('log')
  async log(cwd: string, path?: string, count?: number): Promise<GitLogResponse> {
    return await readLog(this.ctx.shell, cwd, path, count)
  }

  /**
   * Files with uncommitted changes, for the timeline's quick picker.
   * @param cwd - session working directory.
   * @returns the repository identity and the changed files.
   */
  @Remote('changed')
  async changed(cwd: string): Promise<ChangedResponse> {
    return await readChanged(this.ctx.shell, cwd)
  }
}

export default GitTimeline
