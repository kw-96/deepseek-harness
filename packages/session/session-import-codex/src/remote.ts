/**
 * Host Remote namespace backing the Codex-import settings card. `run` triggers
 * one import sweep and records it as history; `history` reads the recorded
 * runs newest-first. The sweep itself lives in the function plugin, which
 * passes a runner closure into this controller.
 * @module @deepseek-ai/dsh-session-import-codex/remote
 */

import { Context } from '@deepseek-ai/cordis'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { codexImportDomainSpec } from './spec.ts'
import type { CodexImportRunRecord } from './spec.ts'
import type {
  CodexImportHistoryValue,
  CodexImportRun,
  CodexImportSweepResult,
} from './types.ts'

/** Run one import sweep on demand; supplied by the function plugin. */
export type CodexImportRunner = (signal: AbortSignal) => Promise<CodexImportSweepResult>

/** Controller configuration: the sweep runner that produces run content. */
export interface CodexImportControllerConfig {
  readonly run: CodexImportRunner
}

/**
 * Remote business surface for the card: trigger a run and read history. The
 * controller owns the durable `codex_import` domain and never touches the
 * session log beyond what the sweep already wrote.
 */
export class CodexImportController extends TypertRemoteService {
  static inject = ['storageDomain']

  private readonly runSweep: CodexImportRunner
  private tablePromise?: Promise<KvTable<string, CodexImportRunRecord>>

  /**
   * @param ctx - Host context carrying the storage-domain form.
   * @param config - the sweep runner and nothing else.
   */
  constructor(ctx: Context, config: CodexImportControllerConfig) {
    super(ctx, 'codexImport')
    this.runSweep = config.run
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

  /** Copy a sweep result into a durable run record. */
  private toRecord(at: number, result: CodexImportSweepResult): CodexImportRunRecord {
    return {
      at,
      imported: result.summary.imported,
      skippedExisting: result.summary.skippedExisting,
      skippedEmpty: result.summary.skippedEmpty,
      sessions: result.sessions.map(session => ({ id: session.id, title: session.title })),
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
