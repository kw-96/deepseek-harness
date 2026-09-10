# Agent Note: Codex import history fold and scroll

Status: implemented

English | [中文](2026-09-08-codex-import-history-collapsible.zh.md)

## Problem

The Codex import card in the Web **Plugins** settings tab rendered the whole durable import history inline: every recorded run listed all of its imported sessions with per-session **Open** buttons. One run importing many threads — the reported case had 14 deferred-active threads alone — or an accumulating run history stretched the settings panel, pushing the panel chrome and every other plugin card out of view.

## Decision

The card bounds the history list at a 240 px column that scrolls internally, so long histories stop growing the panel. Each run that changed sessions becomes a disclosure: the run head (timestamp plus outcome counts) is a button toggling the session list, with the chevron primitives icon as the affordance and `aria-expanded` carrying the state. The newest run opens by default, and an import prepending a newer run opens it too; runs without sessions keep a static head plus the "no session changes" hint. Disclosure state is card-local React state keyed by run list position; no new locale copy was needed.

## Alternatives considered

**A scroll container alone.** Rejected: it caps the total height but still shows one long run's sessions in full, and the panel stays dominated by whatever the newest run imports.

**Per-run folding alone, no height cap.** Rejected: many runs still stretch the panel; the internal scroll column bounds the total height regardless of run count.

**One collapse for the whole "Import history" section.** Rejected: hides the newest run's outcome counts, which users want visible right after an import, behind an extra click.

**The native `<details>` element.** Rejected: its uncontrolled open state is reapplied by React across re-renders and is harder to assert in component tests; an explicit `aria-expanded` button matches the PluginCard disclosure pattern the settings UI already uses.

## Consequences

The history area never exceeds 240 px, so the settings panel keeps its fixed viewport height and only its own options area scrolls. Each run's sessions stay one click away while the counts remain visible when folded. The component spec covers the newest-run-open default, folding and unfolding an older run, and the auto-open of a prepended run. The package now value-imports `ui-primitives` (a baseline external, added to `devDependencies`) and `clsx` (added to `dependencies`), and `ui-renderer` joined `devDependencies` to declare its pre-existing type-only import.
