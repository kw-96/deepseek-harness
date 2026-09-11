/** 面板动作的纯实现：Remote 调用的组合与前置校验，供控制器调用。 */

import type { GitEntry } from '../../types.js'
import type { CommitAction } from './state.js'
import type { GitPanelApi, TFn } from '../lib/faces.js'

/** 动作执行所需的上下文。 */
export interface ActionContext {
  api: GitPanelApi
  cwd: string
  t: TFn
}

/**
 * 执行一次提交；按动作附加修补、拉取与推送。
 * @param ctx 动作上下文
 * @param message 提交信息（不允许空）
 * @param action 提交方式
 * @returns 给界面显示的说明（含新短哈希）
 */
export async function runCommit(ctx: ActionContext, message: string, action: CommitAction): Promise<string> {
  if (message.trim() === '') throw new Error(ctx.t('noMessage'))
  const result = await ctx.api.commit(ctx.cwd, message, action === 'amend')
  if (action === 'commitSync') await ctx.api.pull(ctx.cwd)
  if (action === 'commitPush' || action === 'commitSync') await ctx.api.push(ctx.cwd)
  return result.shortHash === null ? '' : `${ctx.t('commit')} ${result.shortHash}`
}

/** 暂存或取消暂存一个条目。 */
export async function runToggleStage(ctx: ActionContext, entry: GitEntry, verb: 'stage' | 'unstage'): Promise<string> {
  const paths = [entry.path]
  const result = verb === 'stage' ? await ctx.api.stage(ctx.cwd, paths) : await ctx.api.unstage(ctx.cwd, paths)
  return result.detail
}

/** 丢弃一个已跟踪条目的工作区改动。 */
export async function runDiscard(ctx: ActionContext, entry: GitEntry): Promise<string> {
  return (await ctx.api.discard(ctx.cwd, [entry.path])).detail
}

/** 全部暂存 / 全部取消暂存。 */
export async function runToggleAll(ctx: ActionContext, verb: 'stage' | 'unstage'): Promise<string> {
  const result = verb === 'stage' ? await ctx.api.stageAll(ctx.cwd) : await ctx.api.unstageAll(ctx.cwd)
  return result.detail
}

/** 抓取 / 拉取 / 推送。 */
export async function runRemote(ctx: ActionContext, task: 'fetch' | 'pull' | 'push'): Promise<string> {
  return (await ctx.api[task](ctx.cwd)).detail
}

/** 切换分支。 */
export async function runCheckout(ctx: ActionContext, branch: string): Promise<string> {
  return (await ctx.api.checkout(ctx.cwd, branch)).detail
}

/** 写入 git 身份（全局或本仓库）。 */
export async function runSetIdentity(
  ctx: ActionContext,
  name: string,
  email: string,
  scope: 'global' | 'local',
): Promise<string> {
  return (await ctx.api.setIdentity(ctx.cwd, name, email, scope)).detail
}

/** 新建并切换到分支。 */
export async function runCreateBranch(ctx: ActionContext, name: string): Promise<string> {
  return (await ctx.api.createBranch(ctx.cwd, name)).detail
}

/** 用当前会话的模型起草提交信息。 */
export async function draftMessage(api: GitPanelApi, sessionId: string, cwd: string | undefined): Promise<string> {
  if (cwd === undefined) throw new Error('缺少会话工作目录')
  return (await api.message(sessionId, cwd)).message
}

/** 取上一条提交信息；失败时返回空串（预填失败不应打断提交）。 */
export async function previousMessage(api: GitPanelApi, cwd: string): Promise<string> {
  try {
    return (await api.lastMessage(cwd)).message
  } catch {
    return ''
  }
}
