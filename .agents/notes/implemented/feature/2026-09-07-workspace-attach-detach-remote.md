# Agent Note: Workspace attach/detach over Remote

Status: implemented

English | [中文](2026-09-07-workspace-attach-detach-remote.zh.md)

## Problem

Codex sidebar "move session to project" called `insertSessionBefore`, which only reorders Sessions already accounted by one Workspace. Workspace paths are unique, so same-cwd peer Workspaces almost never exist, and Ungrouped Sessions could not join a matching Workspace from the GUI. Host domain already owned `attachSession` / `detachSession`, but the Workspace Controller Remote and Client `IWorkspaces` face did not expose them.

## Decision

Expose `workspace/attachSession` and `workspace/detachSession` on the Workspace Controller Remote. Client `IWorkspaces.attachSession` / `detachSession` mirror those verbs and upsert the returned Workspace row. Attach still requires the Session header cwd to equal the Workspace path; detach removes membership and leaves the Session Ungrouped. Cross-directory relocation (changing Session cwd) remains out of scope.

Codex-shell "项目" submenu calls attach for path-matched targets and detach for "移到未分组"; mismatched directories stay disabled with an explicit reason.

## Alternatives considered

- Keep UI-only honesty without Host verbs: rejects a real closed loop for Ungrouped → matching Workspace.
- Teach `insertSessionBefore` to attach when unaccounted: conflates reorder with membership and obscures failure codes.
- Change Session cwd from the sidebar: requires a new Host protocol beyond this decision.

## Consequences

GUI and fixtures can move membership without Host-side scripting. API catalogs and Typert client faces regenerate with the two verbs. Cross-cwd "migrate project" stays disabled until a cwd-mutation protocol exists.

## Required verification

- Host: attach matching cwd succeeds; attach mismatched cwd returns `workspace/attach-invalid`; detach returns Ungrouped membership.
- Client model upserts after attach/detach.
- Codex-shell menu shows Ungrouped action when accounted and disables path-mismatched targets.
