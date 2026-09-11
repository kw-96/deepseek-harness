# Agent Note: Browser-agent session sweep isolation

Status: implemented

English | [中文](2026-09-11-browser-agent-sweep-isolation.zh.md)

## Problem

The periodic sweep in `dsh-browser-agent` read `ctx.agents` to decide whether a host session still exists, but the plugin declared only `tools` and `subprocess` as its injections. Cordis throws `cannot get property "agents" without inject` for an undeclared property access, and that throw happened inside the fire-and-forget async closure of a timer callback. Nothing caught it, so it became an unhandled rejection and terminated the whole `dsh web` process under Node 24.

The consequence was far worse than a plugin fault: the backend process carries every session. Once it exited, an already-open desktop window only kept showing its reconnect notice until someone restarted `dsh web` by hand. The process log captured during diagnosis was `dsh: fatal load failure: Error: cannot get property "agents" without inject`, with `isOwnerAlive` and `BskSessionStore.reapOrphaned` at the top of the stack.

The access only happened when the sweep actually iterated over session records: with no records, `.filter` never calls the predicate and the plugin looks healthy, so the defect surfaced as a randomly dropping backend after the first browser session was opened.

## Decision

Two changes, one for the invalid declaration and one for an interface that must not fail.

`BrowserAgent.inject` now includes `agents`, the host-session lookup the sweep depends on; declaring it is what makes the access legal.

The sweep runs through `runSweep`, which wraps orphan reaping and idle reaping in a try/catch and only logs `会话巡检失败：…` on failure. A periodic sweep is background maintenance: one host-service exception or one failing bsk command must not terminate the process carrying the user's sessions.

## Alternatives considered

**Catch inside `isOwnerAlive` only.** That removes this crash but swallows a wiring error into a predicate that is always false, silently disabling orphan reaping; the `runSweep` failure path also covers `sweepIdle` and any maintenance step added later.

**Drop orphan reaping and rely on the idle sweep.** Once a session id is invalid, no call can `browser_stop` on its behalf, so an orphan Agent Window survives until the idle timeout — that is exactly why this sweep exists.

**Install a process-level `unhandledRejection` handler.** It would turn every plugin's unhandled rejection into silent degradation and stop even genuinely fatal errors from terminating the process: a global fallback hiding local defects.

## Testing

`tests/sweep.spec.ts` covers three layers: `runSweep` stays resolved and records the reason when the sweep throws; in a real Cordis composition, a record whose host session is gone is reaped (that path only passes by accessing the real `ctx.agents`); and a throwing liveness check logs a warning while keeping the record instead of letting the exception escape. `tests/composition.spec.ts` asserts the `inject` list declares `agents` and provides an `agents` service stand-in for it.

## Consequences

A failing sweep degrades to a warning, leaving the rest of the plugin and the host process intact. The plugin now waits for the `agents` service at load — it was already reading that service, just without declaring it.

## Deferred

Static detection for this defect class: the repository has no check that every service a plugin accesses is declared in its `inject`, so this one was located from a process log. Turning that into a gate is separate work.
