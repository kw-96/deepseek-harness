# Agent Note: Replacing a terminally failed Session control stream

Status: implemented

English | [中文](2026-09-15-session-control-stream-replacement.zh.md)

## Problem

The Host-wide Session control stream is the browser's only source of per-Session transient state: the queue mirror, the background-job mirror behind the session-header job list, and every projection a conversation reads. Its carrier — a Gateway `RemoteStream` under a `RemoteSnapshotStream` — retries a physical generation on its own, but a terminal outcome ends the consumer for good: a protocol violation (an update before the opening snapshot, a second opening snapshot), or a carrier that failed twice while the Host stayed reachable. The Client plugin's `failed` sink only wrote one line to the console.

A frozen mirror does not read as a failure. The session header stops showing a background job, queued messages stop appearing, projections stop moving, and the tab looks idle. Nothing revived the stream either: the consumer's iteration had ended, and that end aborts the stream's lifetime, so no later frame can arrive on it. The only recovery was a manual page reload, which rebuilds the whole Client runtime.

This deployment hit it after a Host restart under a long-lived tab: the session header stayed empty although `ctx.jobs` held that session's jobs, and only a reload brought the rows back.

## Decision

The Client Session plugin owns the control stream's generations. `apply` opens one generation at a time through `openControl()`; when the live stream reports a terminal failure, the plugin logs it, disposes the failed stream, and opens a successor after a delay. The delay starts at one second and doubles per consecutive failure up to a thirty-second ceiling; an accepted baseline restores the base delay, so a Host that recovers converges within a second while a Host that keeps refusing the stream is retried at a bounded rate.

Only the live stream schedules its own successor (`control !== stream` in the `failed` sink), so a replacement can never be replaced twice.

`connection/reset` restarts the live generation instead of only rebuilding the Session list. A new Host generation republishes every baseline, so the mirror is replaced rather than left describing the generation that just ended.

Disposal stays an effect of the plugin fiber: it cancels a pending replacement timer, disposes the live stream, and makes a late timer callback inert.

## Consequences

A tab converges again without a reload: the header job list, the queue, and the projections resume updating as soon as a replacement baseline arrives.

Terminal failures stay observable. Each one is still logged; what changed is what happens after that line, not whether it appears.

Recovery is wholesale. The replacement's baseline replaces the mirror, so no partially applied frame survives and a recovered tab shows the Host's current state rather than a merge of two.

A permanently unacceptable stream — for example a Client build whose generated frame codecs no longer match the Host — now retries at the ceiling instead of staying dead, and its console line repeats at that rate until the page is reloaded.

## Alternatives considered

**Surface a failed phase in the domain model**, the shape `ClientWorkspaceModel.handleStreamFailure` uses, where a stream failure becomes `state: 'error'`. Rejected because the Session control mirror has no error seat: it feeds slot-level hooks (`useSessions`, `useProjection`) whose consumers have no error branch, and a frozen mirror is already indistinguishable from an idle Session, so an error state nobody renders would change nothing observable.

**Retry inside the Gateway `RemoteStream`** instead of in the domain owner. Rejected because its one-isolated-retry budget is deliberate — it separates physical carrier loss from business and protocol failure — and a protocol violation is not repaired by repeating it in the transport. The domain that must keep converging owns its replacement.

**Reload the page on a terminal failure.** Rejected because it discards everything the page owns — composer drafts, unsent attachments, scroll position, panel state — to recover one stream.

**Poll the control state after a failure.** Rejected because the complete-baseline frame already exists; a poll verb would add wire surface for the single case a replacement baseline answers.

## Testing

`packages/api/session-controller/tests/client-apply.client.spec.ts` drives the whole path against the programmable Host fake: a protocol violation (a second opening snapshot) terminates the generation, no baseline arrives before the delay elapses, one arrives after it, and disposing the plugin fiber leaves no further generation. The terminal-failure case in the same file keeps pinning the diagnostic itself.
