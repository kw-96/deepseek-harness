import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { attachCodexSessionWorkspace } from '../src/workspace.ts'

/** 创建仅提供工作区注册表的导入上下文。 */
function makeContext(create: WorkspaceRegistry['create']): Context {
  const ctx = new Context()
  ctx.provide('workspaceRegistry', { create } as unknown as WorkspaceRegistry)
  return ctx
}

describe('attachCodexSessionWorkspace', () => {
  it('creates or reuses the cwd workspace and attaches the session', async () => {
    const attachSession = vi.fn(async (): Promise<void> => {})
    const create = vi.fn(async () => ({ attachSession }))
    const ctx = makeContext(create as unknown as WorkspaceRegistry['create'])

    await attachCodexSessionWorkspace(ctx, SessionId('codex-thread'), 'C:\\workspace')

    expect(create).toHaveBeenCalledWith('C:\\workspace')
    expect(attachSession).toHaveBeenCalledWith(SessionId('codex-thread'))
  })

  it('keeps a session ungrouped when its header has no cwd', async () => {
    const create = vi.fn()
    const ctx = makeContext(create as unknown as WorkspaceRegistry['create'])

    await attachCodexSessionWorkspace(ctx, SessionId('codex-thread'), undefined)

    expect(create).not.toHaveBeenCalled()
  })

  it('logs workspace failures without discarding the imported session', async () => {
    const create = vi.fn(async (): Promise<never> => { throw new Error('missing directory') })
    const ctx = makeContext(create as unknown as WorkspaceRegistry['create'])
    const warn = vi.spyOn(ctx.logger, 'warn')

    await attachCodexSessionWorkspace(ctx, SessionId('codex-thread'), 'C:\\missing')

    expect(warn).toHaveBeenCalledOnce()
  })
})
