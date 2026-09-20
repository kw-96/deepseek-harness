# Agent Note: Gate exceptions for a fork without GitHub workflows

Status: implemented

English | [中文](2026-09-20-fork-gate-exceptions.zh.md)

## Problem

This checkout deliberately removed `.github/workflows/**`: keeping those files absent is what keeps GitHub Actions from triggering at all. Three maintained-file gates assume the upstream layout, so four documentation gates stayed red on this fork — the `Workspace` type blocks still described the pre-alpha.2 ownership rule, historical notes and `docs/development.md` linked deleted workflows, historical logs carried bare commit identifiers, and vendored content tripped the blocked-term rule.

## Decision

Each gate got the narrowest exception that fits it:

- `verify-md-links` skips link targets under `.github/workflows/`. Historical implementation notes keep their authored text.
- `verify-concrete-terms` excludes `.runtime/` (a vendored Node distribution carrying npm's own documentation) and `community/skills/` (third-party skill content carried verbatim).
- The blocked-term usage inside the locally owned `session-import-codex` package was renamed instead of excluded (its constant now reads `CODEX_ORIGIN`), so the package stays under the rule.
- The `Workspace` type blocks in `docs/subsystems/workspace.md` and `workspace.zh.md` were re-recorded against the current source, and the surrounding narrative dropped the retired candidate-account wording.
- Bare commit identifiers in historical logs became equivalent prose.

## Alternatives considered

**Restore `.github/workflows/**`.** Rejected: the deletion is a deployment decision, and restoring the files lets GitHub Actions run on this fork again.

**Rewrite the historical notes and logs to drop every dead reference.** Rejected: `.agents/notes/implemented/**` records what was true when written, and rewriting it destroys that record.

**Rename the blocked term in vendored content too.** Rejected: `.runtime/` and `community/skills/` carry upstream text verbatim, so their wording is not ours to change.

## Consequences

Reverting the workflow deletion needs no counter-change here: the link-checker skip keys on the target path, so those targets resume being checked the moment the files exist again.
