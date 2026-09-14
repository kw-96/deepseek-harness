# Agent Note: Stopping one background job from the session header

Status: implemented

English | [中文](2026-09-14-session-job-stop-control.zh.md)

## Problem

The Web background-job surface listed a session's jobs and could do nothing about them: [the display note](2026-08-08-web-background-job-display.md) fixed it as a read-only projection for the human, and the only cancellation path was the model-facing `job_kill` tool. A job that hangs — a shell command that never returns, a delegation whose producer stops making progress — therefore left the operator waiting on the agent to notice. The header said "1 background job running" and offered no control while the row kept ticking. The display note recorded the blocker outright: `kill()` marks the terminal delivery reported, so a human interrupt written against that contract would leave the model believing its task was still running.

## Decision

The session header's job list gains a Stop control on live rows, backed by a new `session/killJob` Remote method on the Session Controller.

- `SessionCommandController.killJob(sessionId, jobId, reason?)` resolves the session's live Agent from the Agent registry, applies the same subagent-ownership refusal every session command applies, and calls `ctx.jobs.kill(jobId, agent, reason)`. Passing the Agent is the ownership fence: the registry refuses a job belonging to another session, so one session's header can never cancel another's work.
- The jobs service is read optionally (`ctx.get('jobs')`). A deployment that mounts the session API without a background-job registry answers `session/job-not-found` instead of holding the whole controller pending on a service it does not need.
- **The owner is told.** Because `kill()` marks the terminal delivery reported, the registry never sends its own completion notice for a job it cancelled. The command therefore injects its own plugin-sourced notice (`session-controller`, form `notice`) into the owning agent, which reaches a busy owner with its next step and an idle one with its next prompt. This is the decision the display note left open as its reason to stay read-only.
- The registry's own outcome is returned to the caller: `requested` for a live job it cancelled, `already-finished` for one that settled first. The client renders the row from the registry frames it already mirrors, so the row moves to `stopping` and then to its terminal status without a refetch.
- The browser half injects a session-bound `stopJob(jobId)` face and keeps no state: the click is one RPC, and the authoritative status arrives on the existing `jobs` control frame.

## Alternatives considered

- **Widen the existing `cancel`.** Cancelling a job and cancelling a turn are different operations with different quiescence: a turn cancel aborts the model stream and keeps the inbox, while a job kill cancels one producer and releases its waiters. One endpoint would have to branch on a discriminator for no shared behavior.
- **Expose `job_kill` to the browser through the jobs plugin.** The jobs packages own the registry and the model-facing tools; they mount no Remote namespace, and the session controller is already the BFF that publishes per-session job frames and owns session-addressed commands.
- **Keep the panel read-only and route the request through the agent** (tell the model to stop the job). That is what the surface forced before; it depends on a live turn and on the model acting, which is exactly what is unavailable when a job is stuck.

## Consequences

- An operator can end a live background job without the agent's cooperation, and without waiting for the turn that started it.
- The control stops one job. It does not stop the turn, does not clear the queue, and does not change what happens to the transcript — those remain the composer's stop and the queue dock.
- A refused or unknown job leaves the row showing its live status rather than a false success; the failure is visible as "nothing changed" and no toast is raised, because the surface has no error channel of its own.
- A job that ignores its cancellation signal keeps reporting `stopping` until its producer settles; the registry marks it as requested-to-stop rather than pretending it ended.
- The injected notice is the model's only signal that a human ended its job, so a job killed while its owner is idle stays unacknowledged until that owner runs again.

## Testing

`packages/api/session-controller/tests/commands-kill-job.host.spec.ts` drives the command over the real session, agent, and job registries: a live job reports `requested`, reaches the producer's `cancel` with the operator's reason, and injects exactly one plugin-sourced notice; a settled job reports `already-finished` without cancelling and without a notice; an unknown id and a deployment without a registry both raise `session/job-not-found`; an unattached session raises `session/not-found`; a subagent-owned session is refused. `packages/client/ui-jobs/tests/job-list-action.client.spec.tsx` covers the control on a live row, its disabled `stopping` state, and its absence on settled rows; the plugin spec asserts the declared services and the header registration.

## Related

- [Web background-job display](2026-08-08-web-background-job-display.md) owned the read-only decision this note supersedes for live rows; its ordering, badge, and duration rules still stand, and the registry's ownership fence plus the model-facing tools remain with the jobs packages.
