# Agent Note: Chat folds settled tool calls while a turn still streams

Status: implemented

English | [中文](2026-09-08-chat-streaming-process-fold.zh.md)

## Problem

The Chat view folded a turn's process rows (tool calls, subagent delegations) only after the turn closed: the `turn-process` disclosure window required `turnClosed` plus a finalized answer boundary. While a turn ran, every recorded call stayed expanded in the flow, so a long agent run stacked the whole tool history on screen; only the finished round collapsed it.

## Decision

The process disclosure now also folds while a turn has no final answer — running, or closed by interruption. Streaming folds are kind-based, not position-based: contentful Assistant messages stay visible as the message boundary; settled Tool rows fold regardless of position; every other process member — context injection rows, reasoning-only Assistant rows — folds wherever it sits, before or after the latest message. Only the running call tree and live model-retry rows stay expanded. The disclosure shows the settled counts (`foldedToolCalls` / `foldedSubagents`, zero messages) and falls back to the "thought for a while" title while only reasoning folded. A turn with a final answer keeps the existing whole-turn answer-boundary fold; a live turn with nothing foldable keeps no disclosure line. The chat store's turn-process entry accepts `answerStep: null` so a streaming disclosure can expand and remembers its state per generation. `latestAnswer` no longer treats an interrupted closing message as the answer, so interrupted turns keep the streaming rules.

## Alternatives considered

**Fold only at answer time (status quo).** Rejected: the complaint is exactly that a long running turn never recedes.

**Fold everything including the active call.** Rejected: the active call's streamed output is the turn's live signal; hiding it would bury progress under a counter.

**Per-call auto-collapse rows instead of the process disclosure.** Rejected: settled rows are already one-line summaries; the disclosure line is the established "fold a group into one row" idiom, so reusing it keeps one collapse model.

## Consequences

The fold mechanism (window ready, member range, hidden-until-found, persisted open state) is reused, not duplicated. `ChatTurnProcessPresentation` gains `streamFoldEnd`, `foldedToolCalls`, and `foldedSubagents`; `TurnProcessOwnerProps` gains optional streaming fields; `storedTurnProcessEntry` now matches by `(turn, answerStep)` with `null` allowed. Component tests cover kind-based folding beside a running call, folded subagent counts, context and reasoning rows folding before and after the message boundary, interrupted turns keeping streaming rules, live retries staying visible, and no-foldable-member turns staying fully expanded. `bash-abort-row` and `steering` e2e assertions and goldens were updated for the new interrupted/streaming disclosure; the remaining reload/continuation e2e failures reproduce on the pre-change code and are unrelated.
