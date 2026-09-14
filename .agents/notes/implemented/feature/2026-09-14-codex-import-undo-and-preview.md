# Agent Note: Codex import undo and read-only preview

Status: implemented

[中文](2026-09-14-codex-import-undo-and-preview.zh.md) | English

## Problem

An import sweep writes DSH sessions, reconciles workspaces and projects, and leaves nothing behind that lets an operator take any of it back. A user who imports a Codex store by mistake — or who wants to know what a sweep would do before it writes — had one control, **Import now**: the first feedback arrived after the sessions already existed, and undoing meant finding each imported session in the sidebar and archiving it by hand. Import history recorded the sessions a run created, but exposed them only as titles behind a disclosure.

## Decision

The `codexImport` Remote gains `scan()`, `undo(at)`, and `restore(at)`, and the settings card exposes them: a **Preview** button that renders the next sweep's verdicts, and per-run **Undo** and **Restore** buttons with an undone marker.

`scan()` reports what the next sweep would do without writing a session, a workspace, a project, or a history entry. It shares the sweep's enumeration and its snapshot builder, so a preview cannot disagree with the run it describes. The classification the sweep performs implicitly through its writes is now explicit: `CodexImportReconciler.classify()` reads the stored header and events and returns `imported`, `updated`, `unchanged`, or `deferred-active` without touching storage, the live store, or workspaces.

`undo(at)` archives every session one recorded run created and stamps the run with `undoneAt`; `restore(at)` unarchives them and clears the stamp. DSH has no durable session deletion, and archiving is its own reversible lifecycle ([reversible session archive](2026-09-11-reversible-session-archive-and-auto-archive.md)), so undo deletes no evidence, never touches the session log, and stays recoverable from the sidebar's archived group. Sessions the workspace registry no longer knows are counted in the returned `failed` count and skipped rather than aborting the rest of the run; a run time that was never recorded is rejected.

The stamp lives in the durable run record and the card re-reads history after undo or restore, so two tabs, a reload, or a second machine agree on whether a run is undone.

## Alternatives considered

- **Deleting the imported sessions.** DSH exposes no session-deletion capability; a plugin-local delete would have to drop log files behind the persistence, index, and projection-cache layers. Rejected for a feature whose entire point is safety.
- **A dry-run flag threaded through `runImportSweep`.** One function would then decide both what to write and what to report, and the flag would also have to guard project reconciliation separately — the one part of a sweep that writes outside the session store. Rejected for an explicit `classify()` that both callers share.
- **Keeping the undone flag only in card state.** The browser would forget it on reload and disagree between tabs or machines.

## Consequences

- Operators can preview an import and reverse one, and the reversed sessions keep their evidence in DSH.
- **Preview is as expensive as the sweep it describes**: it reads every stored session header and event log, bounded by the same caps. That read is the price of never disagreeing with the run.
- Undo does not stop later sweeps: an undone run's sessions reconcile as `unchanged`, or receive appended Codex content that stays archived and invisible. Acceptable because a sweep never unarchives, and `restore` surfaces the current content.
- A run undone on one machine is undone for the store, not for the Codex source: the next sweep re-imports nothing, because the imported sessions still exist.

## Testing

`packages/session/session-import-codex/tests/loader-composition.spec.ts` drives the real Loader composition. The preview case asserts the counts and per-thread verdicts and that no session, workspace, or history entry is written, then re-runs `scan()` after a sweep and expects every thread to read `unchanged`. The undo case asserts both sessions land in `archivedSessionIds`, the stamp survives a reload, a repeated undo changes nothing, and `restore` clears both the archive set and the stamp. The controller and card specs cover the Preview button, the verdict panel, the undone marker, and the undo and restore callbacks.

## Related

- [Codex session import](2026-09-04-codex-session-import.md) owns the import mechanism this extends.
- [Reversible session archive and sidebar auto-archive](2026-09-11-reversible-session-archive-and-auto-archive.md) owns the archive semantics undo reuses.
