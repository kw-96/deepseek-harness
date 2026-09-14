/**
 * Host Remote namespace backing the Codex-import settings card. `run` triggers
 * one import sweep and records it as history; `history` reads the recorded
 * runs newest-first. The sweep itself lives in the function plugin, which
 * passes a runner closure into this controller.
 * @module @deepseek-ai/dsh-session-import-codex/remote
 */

import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { codexImportDomainSpec } from './spec.ts'
import type { CodexImportRunRecord } from './spec.ts'
import type {
  CodexImportHistoryValue,
  CodexImportRun,
  CodexImportScanValue,
  CodexImportSweepResult,
  CodexImportUndoValue,
} from './types.ts'

/** Run one import sweep on demand; supplied by the function plugin. */
export type CodexImportRunner = (signal: AbortSignal) => Promise<CodexImportSweepResult>

/** Compute the read-only preview of the next sweep; supplied by the function plugin. */
export type CodexImportScanner = (signal: AbortSignal) => Promise<CodexImportScanValue>

/** Controller configuration: the sweep and preview runners that produce content. */
export interface CodexImportControllerConfig {
  readonly run: CodexImportRunner
  readonly scan: CodexImportScanner
}

/**
 * Remote business surface for the card: trigger a run and read history. The
 * controller owns the durable `codex_import` domain and never touches the
 * session log beyond what the sweep already wrote.
 */
export class CodexImportController extends TypertRemoteService {
  static inject = ['storageDomain', 'workspaceRegistry']

  private readonly runSweep: CodexImportRunner
  private readonly runScan: CodexImportScanner
  private tablePromise?: Promise<KvTable<string, CodexImportRunRecord>>

  /**
   * @param ctx - Host context carrying the storage-domain form.
   * @param config - the sweep and preview runners and nothing else.
   */
  constructor(ctx: Context, config: CodexImportControllerConfig) {
    super(ctx, 'codexImport')
    this.runSweep = config.run
    this.runScan = config.scan
  }

  /**
   * Run one import sweep now and record its outcome as the newest history run.
   * @returns the recorded run.
   */
  @Remote('run')
  async run(): Promise<CodexImportRun> {
    const result = await this.runSweep(new AbortController().signal)
    const record = this.toRecord(Date.now(), result)
    const table = await this.ensureTable()
    await table.put(String(record.at), record)
    return record
  }

  /**
   * Preview the next sweep without writing: per-thread verdicts and counts in
   * the sweep's own vocabulary. Nothing is persisted, no workspace or project
   * is created, and no session is published.
   * @returns the preview.
   */
  @Remote('scan')
  async scan(): Promise<CodexImportScanValue> {
    return await this.runScan(new AbortController().signal)
  }

  /**
   * Read recorded import runs, newest first.
   * @returns the complete history list.
   */
  @Remote('history')
  async history(): Promise<CodexImportHistoryValue> {
    const table = await this.ensureTable()
    const runs: CodexImportRunRecord[] = []
    for (const [, record] of table.entries()) {
      runs.push(record)
    }
    runs.sort((left, right) => right.at - left.at)
    return { runs }
  }

  /**
   * Undo one recorded run by archiving the sessions it imported, then stamp
   * the run. The sessions stay in DSH storage, so undo is reversible through
   * {@link restore} and the evidence never disappears.
   * @param at - run time identifying the run.
   * @returns the outcome counts for the card.
   */
  @Remote('undo')
  async undo(at: number): Promise<CodexImportUndoValue> {
    return await this.setArchived(at, true)
  }

  /**
   * Restore the sessions of one undone run and clear its stamp.
   * @param at - run time identifying the run.
   * @returns the outcome counts for the card.
   */
  @Remote('restore')
  async restore(at: number): Promise<CodexImportUndoValue> {
    return await this.setArchived(at, false)
  }

  /**
   * Archive or unarchive every session of one run.
   *
   * The registry rejects sessions it no longer knows (a Codex thread imported
   * on another machine, a session the user removed by hand). One such session
   * must not strand the rest of the run, so failures are counted and reported
   * instead of thrown; the stamp still flips, and a later restore retries.
   */
  private async setArchived(at: number, undone: boolean): Promise<CodexImportUndoValue> {
    const table = await this.ensureTable()
    const record = await table.get(String(at))
    if (record === undefined) {
      throw new Error(`session-import-codex: no import run is recorded at ${String(at)}`)
    }
    if ((record.undoneAt !== 0) === undone) return { at, undone, changed: 0, failed: 0 }
    let changed = 0
    let failed = 0
    for (const session of record.sessions) {
      const id = SessionId(session.id)
      try {
        if (undone) await this.ctx.workspaceRegistry.archiveSession(id)
        else await this.ctx.workspaceRegistry.unarchiveSession(id)
        changed += 1
      } catch {
        // The registry no longer knows this session; count it and continue.
        failed += 1
      }
    }
    await table.put(String(at), { ...record, undoneAt: undone ? Date.now() : 0 })
    return { at, undone, changed, failed }
  }

  /** Copy a sweep result into a durable run record. */
  private toRecord(at: number, result: CodexImportSweepResult): CodexImportRunRecord {
    return {
      at,
      imported: result.summary.imported,
      updated: result.summary.updated,
      skippedExisting: result.summary.skippedExisting,
      skippedEmpty: result.summary.skippedEmpty,
      deferredActive: result.summary.deferredActive,
      sessions: result.sessions.map(session => ({ id: session.id, title: session.title })),
      undoneAt: 0,
    }
  }

  /** Open (once) and own the durable history domain, then return its table. */
  private ensureTable(): Promise<KvTable<string, CodexImportRunRecord>> {
    if (this.tablePromise === undefined) {
      this.tablePromise = this.ctx.storageDomain.open(codexImportDomainSpec)
        .then((domain) => {
          this.ctx.effect(() => async () => {
            await domain.close()
          }, 'codexImport: domain close')
          return domain.table('runs')
        })
    }
    return this.tablePromise
  }
}
