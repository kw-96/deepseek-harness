# Agent Note: Explicit workspace membership with cross-project session moves

Status: implemented

[中文](2026-09-07-workspace-explicit-membership.zh.md) | English

## Problem

Workspace membership required a session header cwd that resolved to the workspace path. The Codex-style sidebar could therefore only move a session into the project matching its cwd; every other project was disabled with a path-mismatch reason, so users could not reorganize sessions across projects the way Codex does.

## Decision

Membership is now an explicit, durable account. `WorkspaceEntity.attachSession` verifies only that the session still exists (via the header index) before prepending its id; the `sessionIds` projection and the `mutate` write chain no longer filter by canonical cwd. The cwd index is retained solely for first-run bootstrap, which still groups historical sessions by directory.

A new `moveSession({ sessionId, workspaceId })` Remote on `ctx.workspaceController` detaches the session from its current owner (if any) and attaches it to the target inside one serialized command slot, so a session can never be accounted by two workspaces. The Codex sidebar menu now lists every other project as a move target, and dragging a session onto another project routes through `moveSession`; within-project reordering still uses `insertSessionBefore`.

The session's own cwd, stored log, and system-prompt `cwd` variable are deliberately untouched: moving a project changes only navigation grouping, not where the session runs. New sessions in a workspace still inherit that workspace path as their cwd.

## Alternatives considered

**Rewrite the session header cwd and migrate the log.** Rejected: the jsonl backend stores the header in an immutable, checksummed first frame; rewriting it for a navigation-only move risks replay and durability without adding a real capability.

## Consequences

`Workspace.sessionIds` no longer guarantees `cwd === path`. `dsh-codex-shell` 0.6.5 depends on the new `moveSession` Remote; older plugin builds still work for same-project attach but cannot move across projects.
