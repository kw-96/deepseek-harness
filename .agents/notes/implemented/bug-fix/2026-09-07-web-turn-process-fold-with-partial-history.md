# Agent Note: Fold completed Chat Turns while Load earlier remains

Status: implemented

English | [中文](2026-09-07-web-turn-process-fold-with-partial-history.zh.md)

## Problem

[Web Turn process folding](../../archived/feature/2026-08-14-web-turn-process-folding.md) withheld Compact disclosure whenever Session history still offered Load earlier. Long sessions almost always keep that control, so Compact never collapsed tools or reasoning even though the preference was already `compact` and the loaded Turns had final answers. Users saw the setting as broken.

## Decision

`ChatNodeSeat` no longer gates foldability on Session `hasMore`. A closed Turn with a finalized answer boundary folds under Compact as soon as its `TurnProcessSpec` and presentation are ready in the loaded window. Load earlier still pages older events; prepended Turns fold when their own process facts become complete. Open Turns, Turns without a final answer, Normal mode, and focus preservation keep the rules from the original folding decision.

## Alternatives considered

**Keep the `hasMore` gate until history is fully loaded.** Rejected: it makes Compact inert for the common long-session case the preference exists to solve.

**Fold only Turns whose `processStartSeq` is strictly after the loaded window head.** Rejected: process membership already comes from the assembled Chat Nodes in the window; an extra seq comparison would hide eligible groups whose earlier evidence is simply not loaded yet, while still leaving the visible answer and later members inconsistent.

## Consequences

Compact collapses eligible loaded Turns while Load earlier remains visible, so long Chat sessions match the Compact preference without forcing a full history pull. Prepending older pages can still reflow height above the reader when newly eligible groups collapse. Unit coverage pins folding with `hasMore: true` and folding after a Load-earlier prepend that leaves `hasMore` true. The original folding note records the retained disclosure rules and now cross-links this gate change.
