# Codex 会话导入

[English](session-import.md) | 中文

由 [`@deepseek-ai/dsh-session-import-codex`](../../packages/session/session-import-codex/README.zh.md) 拥有的 Codex 导入子系统。一次扫描读取本机 Codex 安装——`thread_history_1.sqlite` 中的当前线程、`session_index.jsonl` 中的整理标题，以及存在时的归档 rollout 文件——把每个线程转换成一份普通的 DSH 事件日志，持久化存储、实时发布，并按线程的工作目录对其 Workspace 归属做一次对账。导入的会话保持固定 id `codex-<threadId>`，因此重复扫描只会替换发生变化快照而不会产生副本，且同一 id 下当前 SQLite 线程优先于归档 rollout。导入器只读 Codex，从不回写。

Source: [`packages/session/session-import-codex/src/types.ts`](../../packages/session/session-import-codex/src/types.ts)

## 导入记录

### `CodexImportRun` — 一次已记录的扫描

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

### `CodexImportHistoryValue` — `history` 的返回值

```ts type-equiv
/** The Remote `history` result: recorded runs, newest first. */
interface CodexImportHistoryValue {
  readonly runs: readonly CodexImportRun[]
}
```

## 对外接口

`ctx.codexImport` 提供 `run()`（立即执行一次扫描）与 `history()`（持久化运行记录，最新在前）。下方生成的 [Cordis API](#cordis-surface) 区域给出两个签名。

除非 `codex-import` 设置命名空间打开了它唯一的 `autoSync` 字段，扫描按需触发：打开后立即执行一次，之后按 `syncIntervalMs` 周期重复；设置卡片上的 **立即导入** 始终可手动执行。导入配置（`codexHome`、`cwd`、`maxToolResultChars`、`maxTitleChars`、`syncIntervalMs`）在[配置目录](../config-catalog.zh.md#deepseek-aidsh-session-import-codex)中完整列出。Web 卡片由客户端插件 `@deepseek-ai/dsh-client-ui-codex-import` 渲染。

## 扫描与来源词表

上面两个 Remote 值是本包的对外契约；一次扫描还携带内部记账并读取 Codex 自身的记录：`CodexImportSummary` 汇总结果计数，`CodexImportSession` 标识一个产出会话，`CodexImportSweepResult` 把汇总与其会话配对，`ImportBounds` 把配置的文本上限带入转换。读取路径命名 Codex 存储的内容——`CodexThreadRecord`、`CodexThreadTurn`、`CodexThreadItem`——它们的行为（含条目到事件的映射表，以及单个线程失败只告警、不中断扫描的规则）由[包 README](../../packages/session/session-import-codex/README.zh.md) 拥有。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
