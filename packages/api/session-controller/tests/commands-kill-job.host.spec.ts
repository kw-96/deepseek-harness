/**
 * `killJob`: the session-header stop control. Covers the live/settled outcome
 * pair, the two not-found paths (unknown id and a deployment without a job
 * registry), an unattached session, and the subagent-ownership refusal that
 * every session command shares.
 */
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, Inbox } from '@deepseek-ai/dsh-agent'
import type { JobOutcome } from '@deepseek-ai/dsh-jobs'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { subagentIdentityProjectionDefinition } from '@deepseek-ai/dsh-subagent/src/projection.ts'
import { describe, expect, it, vi } from 'vitest'
import { ApiSessionAgentController } from '../src/agent.ts'
import { SessionCommandController } from '../src/commands.ts'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import { installSessionReadTestServices } from './test-remote.ts'
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'

/** A live producer whose completion the test owns. */
function producer() {
  let settle!: (outcome: JobOutcome) => void
  const cancel = vi.fn()
  return {
    spec: {
      kind: 'bash' as const,
      label: 'sleep 60',
      run: () => ({
        cancel,
        done: new Promise<JobOutcome>((resolve) => { settle = resolve }),
        readOutput: () => '',
      }),
    },
    cancel,
    settle: (outcome: JobOutcome) => { settle(outcome) },
  }
}

/**
 * Boot a command controller over one attached session.
 * @param options - whether the deployment mounts a job registry, and whether
 *   the session is a subagent child of an offline parent.
 */
async function harness(
  options: { withJobs?: boolean; child?: boolean } = {},
): Promise<{ ctx: Context; controller: SessionCommandController; session: Session; agent: Agent }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  installSessionReadTestServices(ctx)
  ctx.sessionProjections.register(subagentIdentityProjectionDefinition)
  if (options.withJobs === true) {
    await ctx.plugin(LocalJobRegistry)
    ctx.jobs.attachController('kill-job-spec')
  }
  const session = ctx.sessions.create(SessionId('kill-job-session'), {
    meta: {
      cwd: '/workspace',
      ...(options.child === true
        ? { origin: 'subagent' as const, parentSession: SessionId('offline-parent') }
        : {}),
    },
  })
  if (options.child === true) {
    session.append('subagent/descriptor', snapshotSubagentDescriptor({
      mode: 'one-shot', provider: 'test', label: 'child',
    }))
  }
  const inbox = createInboxStub() as Inbox
  const agent = { id: session.id, session, inbox, status: 'running', ctx, cancel: vi.fn(), inject: vi.fn() } as unknown as Agent
  ctx.agents.register(agent)
  ctx.provide('workspaceRegistry', { get: () => undefined, list: () => [] } as never)
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'fixture', model: 'fixture-model' }),
    saveSelection: () => Promise.resolve(),
  } as never)
  // The real controller needs the Typert lookup registry; killJob resolves the
  // agent from the Agent registry, so a minimal stand-in is enough here.
  const agents = {
    resolveAgent: () => Promise.resolve({ agent }),
    serializeImageAdmission: <Value>(_agent: Agent, operation: () => Promise<Value>) => operation(),
    composeAgent: () => Promise.resolve({ setup: () => {} }),
  } as unknown as ApiSessionAgentController
  return { ctx, controller: new SessionCommandController(ctx, agents, process.cwd()), session, agent }
}

/** The job id LocalJobRegistry issues for the first started job. */
function firstJobId(): JobId {
  return 'bash-1' as JobId
}

describe('SessionCommandController.killJob', () => {
  it('cancels a live job, notices the owning agent, and reports the request', async () => {
    const { ctx, controller, session, agent } = await harness({ withJobs: true })
    const job = producer()
    const jobId = ctx.jobs.start({ ...job.spec, owner: ctx.agents.get(session.id) })
    expect(jobId).toBe(firstJobId())

    expect(controller.killJob({ sessionId: session.id, jobId, reason: 'test' }))
      .toEqual({ accepted: true, outcome: 'requested' })
    expect(job.cancel).toHaveBeenCalledWith('test')
    // kill() suppresses the registry's own notice, so the command injects one.
    expect(agent.inject).toHaveBeenCalledTimes(1)
    const notice = (agent.inject as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(notice.source).toMatchObject({ kind: 'plugin', plugin: 'session-controller', form: 'notice' })
    expect(notice.content[0].text).toContain('stopped by the user')
  })

  it('reports a settled job as already finished without noticing the agent', async () => {
    const { ctx, controller, session, agent } = await harness({ withJobs: true })
    const job = producer()
    const jobId = ctx.jobs.start({ ...job.spec, owner: ctx.agents.get(session.id) })
    job.settle({ status: 'completed' })
    // The registry records the terminal status after the producer's promise
    // settles, so the kill must observe a finished job rather than race it.
    await new Promise(resolve => setImmediate(resolve))

    expect(controller.killJob({ sessionId: session.id, jobId }))
      .toEqual({ accepted: true, outcome: 'already-finished' })
    expect(job.cancel).not.toHaveBeenCalled()
    expect(agent.inject).not.toHaveBeenCalled()
  })

  it('refuses an unknown job id', async () => {
    const { controller, session } = await harness({ withJobs: true })
    expect(() => controller.killJob({ sessionId: session.id, jobId: 'bash-404' as JobId }))
      .toThrow(/unknown job/)
  })

  it('refuses when the deployment mounts no job registry', async () => {
    const { controller, session } = await harness({ withJobs: false })
    expect(() => controller.killJob({ sessionId: session.id, jobId: firstJobId() }))
      .toThrow(/no background-job registry/)
  })

  it('refuses an unattached session', async () => {
    const { controller } = await harness({ withJobs: true })
    expect(() => controller.killJob({ sessionId: SessionId('cold'), jobId: firstJobId() }))
      .toThrow(/not found/)
  })

  it('refuses a subagent-owned session', async () => {
    const { controller, session } = await harness({ withJobs: true, child: true })
    // The command maps ownership through the shared subagent-ownership error.
    expect(() => controller.killJob({ sessionId: session.id, jobId: firstJobId() }))
      .toThrow(/subagent/)
  })
})
