/**
 * Read-only import preview. The sweep and the preview share one enumeration
 * ({@link collectRecords}) and one snapshot builder, so a preview can never
 * disagree with the run it describes; the preview only adds the classification
 * the sweep performs implicitly through its writes.
 * @module @deepseek-ai/dsh-session-import-codex/scan
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { convertCodexThread } from './convert.ts'
import { loadCodexArchivedThreads, readCodexRollout } from './archive/read.ts'
import { loadCodexThreads } from './sqlite.ts'
import { loadCodexThreadIndex } from './state.ts'
import { CodexImportReconciler, importSnapshot } from './workspace.ts'
import type { CodexThreadIndexEntry } from './state.ts'
import type { CodexThreadRecord } from './types.ts'
import type { ResolvedConfig } from './index.ts'
import type { CodexImportScanEntry, CodexImportScanValue } from './types.ts'

/**
 * Load every Codex thread the sweep and the preview both consider: the current
 * thread store, archived rollouts, and index-only rollouts no store covers, with
 * index titles and working directories applied on top.
 *
 * Every failure is logged and treated as an empty source, so one unreadable
 * store never hides the threads the other sources still expose.
 * @param ctx - context used for diagnostics only.
 * @param config - resolved Codex location.
 * @returns the merged records and whether any source held content at all.
 */
export async function collectRecords(
  ctx: Context,
  config: ResolvedConfig,
): Promise<{ records: CodexThreadRecord[]; empty: boolean }> {
  let currentRecords
  try {
    currentRecords = await loadCodexThreads(config.codexHome)
  } catch (error: unknown) {
    ctx.logger.warn(`session-import-codex: could not read the Codex thread store at ${JSON.stringify(config.codexHome)}: ${String(error)}`)
  }
  let archivedRecords: CodexThreadRecord[]
  try {
    archivedRecords = await loadCodexArchivedThreads(config.codexHome)
  } catch (error: unknown) {
    ctx.logger.warn(`session-import-codex: could not read Codex archived sessions at ${JSON.stringify(join(config.codexHome, 'archived_sessions'))}: ${String(error)}`)
    archivedRecords = []
  }
  let indexEntries: CodexThreadIndexEntry[]
  try {
    indexEntries = await loadCodexThreadIndex(config.codexHome)
  } catch (error: unknown) {
    ctx.logger.warn(`session-import-codex: could not read the Codex state index at ${JSON.stringify(config.codexHome)}: ${String(error)}`)
    indexEntries = []
  }
  if (currentRecords === undefined && archivedRecords.length === 0 && indexEntries.length === 0) {
    return { records: [], empty: true }
  }
  const indexById = new Map(indexEntries.map(entry => [entry.threadId, entry]))
  const current = currentRecords ?? []
  const currentIds = new Set(current.map(record => record.threadId))
  const records: CodexThreadRecord[] = [...current, ...archivedRecords.filter(record => !currentIds.has(record.threadId))]
  const covered = new Set(records.map(record => record.threadId))
  for (const entry of indexEntries) {
    if (covered.has(entry.threadId)) continue
    const record = await readCodexRollout(entry.rolloutPath)
    if (record === undefined) continue
    records.push(record)
    covered.add(record.threadId)
  }
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] as CodexThreadRecord
    const indexed = indexById.get(record.threadId)
    if (indexed === undefined) continue
    records[index] = {
      ...record,
      ...(indexed.cwd === undefined ? {} : { cwd: indexed.cwd }),
      ...(indexed.name === undefined ? {} : { title: indexed.name }),
    }
  }
  return { records, empty: false }
}



/**
 * Report what the next sweep would do without writing a session, a workspace,
 * or a project. Counts use the sweep's own vocabulary, so a card can present
 * "would import / would update / already current / deferred" from one call.
 * @param ctx - context exposing the session, agent, and persistence services.
 * @param config - resolved Codex location and caps.
 * @param signal - aborts the preview between threads.
 * @returns the per-thread verdicts plus their counts.
 */
export async function runImportScan(
  ctx: Context,
  config: ResolvedConfig,
  signal: AbortSignal,
): Promise<CodexImportScanValue> {
  const summary = { imported: 0, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0 }
  const entries: CodexImportScanEntry[] = []
  const { records, empty } = await collectRecords(ctx, config)
  if (empty) return { summary, entries }
  const reconciler = new CodexImportReconciler(ctx)
  for (const record of records) {
    if (signal.aborted) break
    const converted = convertCodexThread(record, config.cwd, config.bounds)
    if (converted.events.length === 0) {
      summary.skippedEmpty += 1
      continue
    }
    const snapshot = importSnapshot(converted, record.threadId, config.cwd)
    const kind = await reconciler.classify(snapshot)
    if (kind === 'imported') summary.imported += 1
    else if (kind === 'updated') summary.updated += 1
    else if (kind === 'deferred-active') summary.deferredActive += 1
    else summary.skippedExisting += 1
    entries.push({
      threadId: record.threadId,
      sessionId: snapshot.id,
      title: snapshot.title,
      cwd: snapshot.header.cwd ?? '',
      kind,
      events: converted.events.length,
    })
  }
  return { summary, entries }
}
