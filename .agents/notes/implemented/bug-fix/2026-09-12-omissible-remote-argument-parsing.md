# Agent Note: Omitting a declared-omissible Remote argument

Status: implemented

English | [中文](2026-09-12-omissible-remote-argument-parsing.zh.md)

## Problem

A strict Remote descriptor may declare a JSON parameter as omissible with `acceptsUndefined: true`. The Host honors that declaration when it checks the arrived `args` object: a field whose parameter is declared omissible may be absent (`assertExactArguments`). The Client half did not honor it. Its prepared invocation parsed every declared parameter, including one the caller left out, so the absent value reached a codec that describes only the present value.

The two halves therefore disagreed about the same descriptor. A descriptor whose `limit`-style codec is a bare `z.number()` — the natural way to write "a number when present" — could be called from a browser only by passing a value; passing none produced `client api: <endpoint> rejected "<parameter>"` before the request left the process. The failure surfaces as a broken panel rather than as a diagnostic naming the real disagreement, because the codec rejection is wrapped as an internal client fault.

The gap stayed hidden because the only fixture exercising `acceptsUndefined` declared its codec as `z.union([z.string(), z.null(), z.undefined()])`. That fixture passes for a different reason than the mechanism under test: it accepts the absent value at the schema layer, so it never reaches the branch where the Client decides whether to parse at all.

## Decision

The Client's prepared invocation skips a parameter that is declared omissible when the caller passed no value for it, instead of parsing it. The parameter is left out of the wire `args`; the Host applies the codec only to values that actually arrived, and the operation's own defaulting decides what an absent value means.

A declared-omissible parameter's codec describes the present value only. It does not need to admit `undefined` at the schema layer, and a descriptor that declares `acceptsUndefined` without widening its schema is valid rather than a trap.

Argument count is unchanged: a caller still supplies one positional value per declared parameter, using `undefined` for one it wants omitted (`log(cwd, undefined)`). Omitting the trailing position entirely remains an arity error, because parameter order is positional and a shorter list cannot say which parameter was left out.

## Consequences

A panel can now call a Remote method with an omissible argument unnamed and have the Host's default apply, which is what the descriptor always promised. The plugin-side workaround of widening a codec to `z.number().optional()` is no longer required for a call to arrive, though a schema that admits `undefined` stays harmless.

The failure mode changes shape rather than disappearing: a Client that passes a wrong-typed value still fails at parse time, and a Client that passes too few positional values still fails the arity check. Only the absent-value case moved.

Alternative-selection is unaffected. A lookup parameter is resolved from the caller's Context rather than from a positional value, so it is skipped before the omissible check and keeps its existing behavior.

The regression fixture declares `limit` with a bare `z.number()`, so it pins the mechanism instead of the schema's permissiveness: it fails if the Client parses an absent value again.

## Alternatives considered

**Widen every omissible codec to admit `undefined`.** This is what the shipped fixture did, and it works — `z.number().optional()` parses an absent value and the existing `value !== undefined` guard then omits the field. It was rejected because it makes each descriptor restate a rule the descriptor already declares: `acceptsUndefined` would mean nothing at the codec layer while the codec carried the real requirement, and any author who wrote the natural `z.number()` would hit the same wrapped failure. It also leaves the two gateway halves disagreeing, so the next reader must rediscover which half enforces what.

**Relax the arity check to accept a shorter positional list.** This was rejected because a shorter list is ambiguous for a descriptor with more than one omissible parameter, and because the check is what keeps a forgotten argument from being silently read as "use the default". The explicit `undefined` placeholder keeps the caller's intent visible at the call site.

**Treat an absent omissible value as an error instead.** This was rejected because it contradicts the Host, which already accepts the field's absence, and because it would make `acceptsUndefined` a Host-only declaration with no Client meaning.
