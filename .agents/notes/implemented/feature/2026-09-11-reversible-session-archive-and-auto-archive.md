# Agent Note: Reversible session archive and sidebar auto-archive

Status: implemented

English | [中文](2026-09-11-reversible-session-archive-and-auto-archive.zh.md)

## Problem

The registry-global archive set was write-only. `WorkspaceRegistry.archiveSession()` appended an id and every grouping surface hid it, but nothing could take an id back out: the workspace package documented the constraint itself ("Archiving is one-way — no unarchive action exists yet"), and the Remote namespace carried no counterpart. A user who archived the wrong session, or whose sidebar auto-hid one, lost the row from every browser until the durable state was edited by hand.

The consumer side had the matching gap in the other direction. The codex-shell sidebar offered only a per-session manual archive, so sessions nobody opened again accumulated forever, and the archived bucket it already rendered had no action attached to its rows — an archived session could be seen but not restored.

## Decision

The archive set becomes a two-way display filter.

**Host.** `WorkspaceRegistry.unarchiveSession(sessionId)` removes an id from `archivedSessionIds`; an id outside the set resolves without writing. It deliberately performs no session-existence check, because archiving never touched the Session's workspace accounting — `sessionIds` still holds the id, so restoring a row is a pure display-set write that returns the session to its original position. `WorkspaceCommands.unarchiveSession` wraps it and returns the complete archive set (the existing `WorkspaceArchiveValue`), and `@Remote('unarchiveSession')` exposes it on `ctx.remote.workspace`; `ClientWorkspaceModel.unarchiveSession` installs the returned set exactly as the archive path does.

**Consumer.** The codex-shell sidebar wires the new verb to an archived-row hover action (`恢复`) in the archive bucket, and adds auto-archive: while the sidebar is mounted, a sweep runs once on mount and every 30 minutes, archiving any session whose `updatedAt` is older than the configured threshold. Running sessions, the current selection, blank placeholders, subagent children, and already-archived ids are skipped. The threshold lives in the sidebar preference store (`autoArchiveDays`, default 30 days, `0` disables) and is offered as 关闭 / 7 / 14 / 30 / 90 天 in the section header's organize menu.

## Alternatives considered

**Make archiving a deletion.** Rejected: the archive set is a display filter that deliberately keeps the durable log and the workspace slot, and session deletion is a separate absent capability with different retention semantics. Deleting would also make the one-way problem permanent instead of reversible.

**Put auto-archive in the host registry.** Rejected for now: it would need a timer and a configuration surface in the workspace domain, while the archive policy in question belongs to the sidebar's browsing surface that already owns the archive action. Moving it later is a Config field on the plugin, not a data migration.

**Restore by re-attaching the session to its workspace.** Rejected: archiving never removed the accounting, so re-attaching would move the row to the front of `sessionIds` and lose the position that archiving promised to preserve.

**Auto-archive on the host schedule only.** Rejected: the sweep would keep writing while nobody browses, and the unarchive API plus the bucket is what makes the feature safe; a browser-side sweep keeps the two halves in one place and leaves the durable state untouched while the GUI is closed.

## Consequences

- Archiving is reversible: the durable set, the archive bucket, and the restore action are consistent without any change to workspace accounting or the Session log.
- Auto-archive is opt-out and adjustable, and it can only act on sessions that are neither running nor selected; an idle machine keeps its sessions until the next time the sidebar opens, which is the accepted cost of not running a host timer.
- `WorkspaceArchiveValue` now serves both directions, so consumers that read the complete set need no new type or ordering rule.
- The Remote surface grew by one method on `ctx.remote.workspace`, which is a harness-side change: typert manifests are cached per package, so an already running `dsh web` must restart before the new verb exists.
- `packages/workspace/workspace/README.md` no longer states that archiving is one-way, and its membership note now matches the code: `attachSession` verifies existence only, so a session recorded in another directory can be accounted to any workspace.
- The generated catalogs carry every fork addition: `codexImport` and its two Remote values are classified on the new [Codex session import](../../../../docs/subsystems/session-import.md) page, and the project tier (`Project`, `ProjectId`), `TerminalFollowFrame`, and the workspace request-type family are classified on their owning pages, so `verify-cordis-catalog` and `verify-type-equiv` pass and the published Cordis reference now includes this verb, the project-registry surface, and `SessionService.replace`. Regenerating [config-catalog.md](../../../../docs/config-catalog.md) also added the fork packages it had never listed.

## Testing

- Registry: durable archive ordering with idempotent repeats, a restore that lands in the durable record and keeps the workspace slot, and silent no-ops for repeated or never-archived ids.
- Controller: `unarchiveSession` returns the complete set for both an archived id and an id outside the set.
- Client model: a failed restore leaves the installed set untouched, a successful one installs the returned set and issues the `unarchiveSession` call.
- Sidebar: preference threshold defaults and normalization (negative and fractional values), the organize menu's threshold entries dispatching the chosen days, and the archived row's restore action firing the callback.
