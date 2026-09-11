# Codex session import

English | [中文](session-import.zh.md)

The Codex import subsystem owned by [`@deepseek-ai/dsh-session-import-codex`](../../packages/session/session-import-codex/README.md). One sweep reads a local Codex install — current threads from `thread_history_1.sqlite`, curated titles from `session_index.jsonl`, and archived rollout files when present — converts each thread into an ordinary DSH event log, stores it durably, publishes it live, and reconciles its Workspace membership against the thread's working directory. An imported session keeps the fixed id `codex-<threadId>`, so a re-run replaces a changed snapshot instead of duplicating it, and the current SQLite thread wins over an archived rollout that shares its id. The importer only reads Codex and never writes back to it.

Source: [`packages/session/session-import-codex/src/types.ts`](../../packages/session/session-import-codex/src/types.ts)

## Import records

### `CodexImportRun` — one recorded sweep

```ts type-equiv
/** One recorded import run returned by the Remote `run`/`history` methods. */
interface CodexImportRun {
  /** Unix epoch milliseconds when the run finished. */
  readonly at: number
  /** Threads newly imported by this run. */
  readonly imported: number
  /** Existing sessions reconciled from their current Codex snapshot. */
  readonly updated: number
  /** Threads skipped because their session already existed. */
  readonly skippedExisting: number
  /** Threads skipped because they converted to no events. */
  readonly skippedEmpty: number
  /** Changed sessions left untouched because a live Agent owns them. */
  readonly deferredActive: number
  /** The sessions this run imported. */
  readonly sessions: readonly CodexImportSession[]
}
```

### `CodexImportHistoryValue` — the `history` result

```ts type-equiv
/** The Remote `history` result: recorded runs, newest first. */
interface CodexImportHistoryValue {
  readonly runs: readonly CodexImportRun[]
}
```

## Surfaces

`ctx.codexImport` serves `run()` — one sweep now — and `history()` — the durable run records, newest first. The generated [Cordis API](#cordis-surface) region below carries both signatures.

Sweeps are on demand unless the `codex-import` settings namespace enables its single `autoSync` field: turning it on runs one sweep immediately and then repeats at `syncIntervalMs`, while the settings card's **Import now** action always runs. The import configuration (`codexHome`, `cwd`, `maxToolResultChars`, `maxTitleChars`, `syncIntervalMs`) is exhaustively listed in the [configuration catalog](../config-catalog.md#deepseek-aidsh-session-import-codex). The Web card is rendered by the `@deepseek-ai/dsh-client-ui-codex-import` client plugin.

## Sweep and source vocabulary

The two Remote values above are the package's outward contract; a sweep also carries internal accounting and reads Codex's own records. `CodexImportSummary` totals the outcomes, `CodexImportSession` identifies one produced session, `CodexImportSweepResult` pairs a summary with its sessions, and `ImportBounds` carries the configured text limits into conversion. The read path names what Codex stores — `CodexThreadRecord`, `CodexThreadTurn`, and `CodexThreadItem` — and [the package README](../../packages/session/session-import-codex/README.md) owns their behavior, including the item-to-event mapping table and the rule that a failing thread is skipped with a warning instead of stopping the sweep.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcodeximport--codeximportcontroller"></a>

### `ctx.codexImport` — `CodexImportController`

Remote business surface for the card: trigger a run and read history. The controller owns the durable `codex_import` domain and never touches the session log beyond what the sweep already wrote.

```ts cordis-catalog
/**
 * Run one import sweep now and record its outcome as the newest history run.
 * @returns the recorded run.
 */
@Remote('run') async run(): Promise<CodexImportRun>

/**
 * Read recorded import runs, newest first.
 * @returns the complete history list.
 */
@Remote('history') async history(): Promise<CodexImportHistoryValue>
```

Source: [`packages/session/session-import-codex/src/remote.ts`](../../packages/session/session-import-codex/src/remote.ts)
<!-- END GENERATED cordis-surface -->
