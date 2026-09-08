# Agent Note: Codex-style sidebar project tier

Status: implemented

English | [中文](2026-09-08-codex-sidebar-project-tier.zh.md)

## Problem

The `codex-shell` sidebar grouped sessions only by workspace directory, so a sidebar whose Codex source was already organized into projects collapsed to a flat directory list. Imported sessions kept their thread-level `cwd`, but nothing reconstructed the project layer that owns several checkout directories under one name.

## Decision

`dsh-workspace` gains a durable `projects` table next to its existing `workspaces` table. A `Project` record holds a display `name` and an ordered `roots` list; a workspace groups under the project whose longest root prefixes its canonical path, so one logical project can own several checkouts. The domain version stays `2` because `projectIds` defaults to an empty list and old stores read unchanged. Codex import reads `state_5.sqlite` `projects` and `project_roots`, reconciles a project per name, and updates its roots. The sidebar renders project folders above workspace folders, collapses both tiers, and supports creating, renaming, re-rooting, and deleting projects through the workspace host remote and client menu.

## Alternatives considered

**Group by first path segment only.** Rejected because Codex projects own arbitrary `project_roots` (including a broad `e:\KW` root) and several roots per project; a single directory heuristic cannot express that.

**Derive projects client-side without durability.** Rejected because renames, root edits, and ordering must survive restarts, and Codex reconciliation has to persist alongside imported sessions.

## Consequences

The sidebar can mirror Codex's project / workspace / session structure while still allowing DSH-created projects and root edits. Workspaces whose directory no root prefixes stay ungrouped. Existing stores load with an empty project list and are migrated only by the next import reconciliation or an explicit create.
