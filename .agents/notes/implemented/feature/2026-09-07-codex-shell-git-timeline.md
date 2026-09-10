# Agent Note: Codex-shell Git changes and history timeline

Status: implemented

English | [中文](2026-09-07-codex-shell-git-timeline.zh.md)

## Problem

The Git workbench exposed real Git operations, but its flat rows did not make a busy working tree or recent commit sequence scannable. Users need grouped changes with file status and a compact commit timeline in the same panel.

## Decision

`dsh-codex-shell` renders staged and unstaged entries as independently collapsible change groups. Each file row shows its name, parent directory, status, and existing stage, unstage, discard, and diff actions. The commit editor stays collapsed until requested. Existing `gitLog` results render as a timeline with commit subject, short hash, author, relative date, and Git ref text.

## Alternatives considered

**Add a static Agent Review section.** Rejected because no review provider produces a durable or live result for this panel; static findings would misrepresent an unperformed review.

**Keep the flat history rows.** Rejected because a commit stream needs visible sequence and metadata, especially when file changes and history share a narrow panel.

## Consequences

The Git panel uses the existing status, diff, mutation, branch, and log Remote methods; no new Host protocol or model request is introduced. The timeline is a compact local rendering of `git log`, not a branch graph or an AI review.
