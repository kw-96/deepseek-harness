# Agent Note: Tool call pairing in imported Codex history

Status: implemented

English | [中文](2026-09-10-tool-call-pairing-in-imported-history.zh.md)

## Problem

A session imported from Codex carried tool results that no assistant message
declared. Codex records a call and its output in ONE thread item, so
`dsh-session-import-codex` emitted only the `tool/call` log record and the
`tool/result` surface message; the model-visible surface therefore held a
`tool-result` block with no preceding `tool-call` block. Such a session ran on
the `codex` route, whose provider tolerated that transcript.

Continuing that session on a strict provider failed the whole request: an
OpenAI-compatible route requires every tool result to answer a declared call,
and the gateway rejected the history with `No tool call found for function call
output with call_id ...`. The failure was total — the session could send no
message at all — and no setting could recover it.

## Decision

Two changes: one for history already on disk, one for the producer.

`dsh-llm-pi-ai` and `dsh-llm-deepseek` replay a tool result whose call the
history does not declare as provider-neutral text instead of a tool message.
Each adapter tracks the call ids its assistant messages declared while it walks
the conversation; a result whose id is absent becomes a user-role text block
built by `unpairedToolResultText` in `dsh-llm`, which names the call and keeps
the result's own text — and, on pi-ai's image path, the result's images — in
place. Both adapters report the substitution through their degradation channel
(`onReplayDegrade`, wired to `ctx.logger.warn`), so a degraded request is
visible instead of silent.

`dsh-session-import-codex` emits the requesting assistant message before each
tool pair. The call is not invented: its id, name, and arguments all come from
the Codex item, and the message joins the same step as its result, which is the
shape the agent loop itself writes. Newly imported sessions are therefore
provider-valid on every route.

The session invariants already permit this shape: `assistant/message` requires
only an open step, and `tool/result` requires a `tool/call` in the same step,
which the pair continues to provide.

## Alternatives considered

**Repair the durable session log.** Rewriting an imported log — synthesizing
assistant calls into existing events, or shadowing the orphan range with a
surface replacement — would make the existing session valid on every route. It
also mutates history a user has already read, needs hand-built events that must
satisfy the session invariants, and fixes nothing for the next import. The
replay-side degradation covers the existing session while the importer change
removes the cause.

**Fail the request with a diagnostic.** Keeping strict replay and letting the
provider reject the history is what happened before this note; it left the
session unable to send anything and the user with a message naming only an
opaque call id.

**Invent a tool name for the missing call.** Synthesizing an assistant
tool-call (name `unknown`, empty arguments) before each orphan result would keep
the wire structure. It fabricates a call the model never made, can fail a
gateway that validates tool names against the declared set, and reads as a
hallucination later in the transcript.

## Testing

`packages/llm/llm-pi-ai/tests/convert.spec.ts` and
`packages/llm/llm-deepseek/tests/serialize.spec.ts` cover both paths: a paired
result stays a provider tool message, an unpaired one becomes the fallback text
(error marker included) and reports its reason.
`packages/session/session-import-codex/tests/convert.spec.ts` asserts that every
`tool/result` cites a call declared by a preceding assistant message.

## Consequences

A session with damaged history keeps working on every route; the affected turns
reach the model as text, so the model loses the explicit call/result pairing for
those turns only. The degradation is per result rather than per session, and it
is logged. Imported transcripts gain one surface event per Codex tool item, so
the import fixtures list it.

## Deferred

No keyless recorded-session snapshot covers the degraded replay: every shipped
snapshot's session log declares the calls its results answer, and recording one
that does not requires a hand-built durable log. The package specs above pin the
conversion, and the import path now produces only paired history.
