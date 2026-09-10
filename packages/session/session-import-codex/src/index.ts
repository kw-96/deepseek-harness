/**
 * Import local Codex threads as DSH sessions. Manual import and an opt-in
 * automatic sweep convert every thread into a DSH event log, store it
 * durably, publish it live, and reconcile it with the workspace matching the
 * current Codex cwd on every later sweep.
 * @module @deepseek-ai/dsh-session-import-codex
 */

import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SessionId, SESSION_FORMAT_VERSION, type SessionHeader } from '@deepseek-ai/dsh-session/types'
import { SessionAlreadyExistsError } from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-settings'
import { convertCodexThread } from './convert.ts'
import { CodexImportController } from './remote.ts'
import {
  CODEX_IMPORT_NS,
  CodexImportSettingsSchema,
  DEFAULT_CODEX_IMPORT_SETTINGS,
  type CodexImportSettings,
} from './settings.ts'
import { loadCodexThreads } from './sqlite.ts'
import { loadCodexArchivedThreads, readCodexRollout } from './archive/read.ts'
import { loadCodexProjects, loadCodexThreadIndex, type CodexProjectIndexEntry, type CodexThreadIndexEntry } from './state.ts'
import type { CodexImportSession, CodexImportSweepResult, CodexThreadRecord, ImportBounds } from './types.ts'
import { CodexImportReconciler, type CodexImportSnapshot } from './workspace.ts'

export { CodexImportController } from './remote.ts'
export type { CodexImportControllerConfig, CodexImportRunner } from './remote.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    codexImport: import('./remote.ts').CodexImportController
  }
}

export type { CodexImportSummary } from './types.ts'

export const name = 'session-import-codex'
export const inject = ['sessions', 'sessionPersistence', 'workspaceRegistry']

/** Default cap for imported tool-result text. */
export const DEFAULT_MAX_TOOL_RESULT_CHARS = 20_000

/** Default cap for an imported Codex thread title. */
export const DEFAULT_MAX_TITLE_CHARS = 300

/** Default repeat interval after a user enables automatic Codex reconciliation. */
export const DEFAULT_SYNC_INTERVAL_MS = 60_000

/** Plugin configuration: Codex source location and import caps. */
export interface Config {
  /**
   * Codex home directory containing the current thread store, optional title
   * index, and legacy `archived_sessions` rollouts. Omitted to resolve from
   * `CODEX_HOME`, then `~/.codex`.
   */
  codexHome?: string
  /**
   * Absolute working directory recorded on imported session headers when a
   * thread carries no command cwd of its own. Omitted to use the process cwd.
   */
  cwd?: string
  /** Maximum UTF-16 code units of imported tool-result text. */
  maxToolResultChars?: number
  /** Maximum UTF-16 code units of an imported session title. */
  maxTitleChars?: number
  /**
   * Periodic re-scan interval in milliseconds while the card's sync toggle is
   * on. `0` disables the timer; the default repeats every 60 seconds after
   * the settings toggle becomes enabled, and the manual button is always
   * available.
   */
  syncIntervalMs?: number
}

export const Config: z<Config> = z.object({
  codexHome: z.string().min(1),
  cwd: z.string().min(1),
  maxToolResultChars: z.number().step(1).min(1).default(DEFAULT_MAX_TOOL_RESULT_CHARS),
  maxTitleChars: z.number().step(1).min(1).default(DEFAULT_MAX_TITLE_CHARS),
  syncIntervalMs: z.number().step(1).min(0).default(DEFAULT_SYNC_INTERVAL_MS),
})

/** Configuration with every fallback resolved and validated. */
export interface ResolvedConfig {
  /** Codex home directory to scan. */
  readonly codexHome: string
  /** Absolute fallback cwd recorded on imported headers. */
  readonly cwd: string
  /** Title and tool-result caps. */
  readonly bounds: ImportBounds
  /** Periodic re-scan interval in milliseconds; `0` disables the timer. */
  readonly syncIntervalMs: number
}

/**
 * Resolve the loader config into concrete import settings. Falls back along
 * the documented chain and rejects a non-absolute fallback cwd, because the
 * header and storage backend both require one.
 * @param config - loader-supplied configuration.
 * @param env - process environment consulted for `CODEX_HOME`.
 * @returns the resolved settings.
 */
export function resolveConfig(config: Config, env: NodeJS.ProcessEnv): ResolvedConfig {
  const cwd = config.cwd ?? process.cwd()
  if (!isAbsolute(cwd)) {
    throw new Error(`session-import-codex: cwd must be an absolute path, got ${JSON.stringify(cwd)}`)
  }
  const codexHome = config.codexHome ?? env['CODEX_HOME'] ?? join(homedir(), '.codex')
  return {
    codexHome,
    cwd,
    bounds: {
      maxToolResultChars: config.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS,
      maxTitleChars: config.maxTitleChars ?? DEFAULT_MAX_TITLE_CHARS,
    },
    syncIntervalMs: config.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS,
  }
}

/** The fixed prefix every imported session id carries. */
const IMPORTED_ID_PREFIX = 'codex-'

/** The imported session id derived from one Codex thread id. */
function importedSessionId(threadId: string): SessionId {
  return SessionId(`${IMPORTED_ID_PREFIX}${threadId}`)
}

/** Build a complete stable DSH snapshot from one non-empty Codex conversion. */
function importSnapshot(
  record: ReturnType<typeof convertCodexThread>,
  threadId: string,
  fallbackCwd: string,
): CodexImportSnapshot {
  const id = importedSessionId(threadId)
  // The sweep skips empty conversions, so the first event always exists.
  // oxlint-disable-next-line typescript/no-non-null-assertion
  const createdAt = record.events[0]!.time
  const cwd = isAbsolute(record.cwd) ? record.cwd : fallbackCwd
  const header: SessionHeader = {
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt,
    cwd,
    isSeeded: false,
    delegationDepth: 0,
  }
  const title = record.events.find(event => event.type === 'session/title')
  return {
    id,
    header,
    events: record.events,
    title: title?.type === 'session/title' ? title.data.title : '',
  }
}

/** Compare two root lists for durable project reconciliation. */
function sameRoots(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((root, index) => root === right[index])
}

/**
 * Reconcile DSH projects from Codex projects by name; created projects keep
 * Codex's root set and existing projects adopt a changed root set.
 * @param ctx - context exposing the workspace registry.
 * @param entries - Codex projects ordered by Codex position.
 */
async function reconcileProjects(ctx: Context, entries: readonly CodexProjectIndexEntry[]): Promise<void> {
  const byName = new Map(ctx.workspaceRegistry.listProjects().map(project => [project.name, project]))
  for (const entry of entries) {
    const project = byName.get(entry.name)
    if (project === undefined) {
      await ctx.workspaceRegistry.createProject(entry.name, entry.roots)
    } else if (!sameRoots(project.roots, entry.roots)) {
      await project.setRoots(entry.roots)
    }
  }
}

/**
 * Run one idempotent import sweep over the Codex thread store. Never rejects:
 * a missing or unreadable store, a failed conversion, and a failed write are
 * all logged and counted instead.
 * @param ctx - context exposing the session and persistence services.
 * @param config - resolved Codex location and caps.
 * @param signal - aborts the sweep between threads.
 * @returns the per-thread outcome counts plus newly imported or updated sessions.
 */
export async function runImportSweep(
  ctx: Context,
  config: ResolvedConfig,
  signal: AbortSignal,
): Promise<CodexImportSweepResult> {
  const summary = { imported: 0, updated: 0, skippedExisting: 0, skippedEmpty: 0, deferredActive: 0 }
  const sessions: CodexImportSession[] = []
  const reconciler = new CodexImportReconciler(ctx)
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
    ctx.logger.info(`session-import-codex: no current, archived, or indexed Codex thread store under ${JSON.stringify(config.codexHome)}; nothing to import`)
    return { summary, sessions }
  }
  const indexById = new Map(indexEntries.map(entry => [entry.threadId, entry]))
  let codexProjects: CodexProjectIndexEntry[]
  try {
    codexProjects = await loadCodexProjects(config.codexHome)
  } catch (error: unknown) {
    ctx.logger.warn(`session-import-codex: could not read Codex projects at ${JSON.stringify(config.codexHome)}: ${String(error)}`)
    codexProjects = []
  }
  try {
    await reconcileProjects(ctx, codexProjects)
  } catch (error: unknown) {
    ctx.logger.warn(`session-import-codex: could not reconcile Codex projects: ${String(error)}`)
  }
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
  for (const record of records) {
    if (signal.aborted) break
    const converted = convertCodexThread(record, config.cwd, config.bounds)
    if (converted.events.length === 0) {
      summary.skippedEmpty += 1
      continue
    }
    try {
      const snapshot = importSnapshot(converted, record.threadId, config.cwd)
      const outcome = await reconciler.reconcile(snapshot)
      if (outcome === 'imported') {
        summary.imported += 1
        sessions.push({ id: snapshot.id, title: snapshot.title })
      } else if (outcome === 'updated') {
        summary.updated += 1
        sessions.push({ id: snapshot.id, title: snapshot.title })
      } else if (outcome === 'deferred-active') {
        summary.deferredActive += 1
      } else {
        summary.skippedExisting += 1
      }
      ctx.logger.info(`session-import-codex: ${outcome} Codex thread "${record.threadId}" as "${snapshot.id}" (${converted.events.length} events)`)
    } catch (error: unknown) {
      if (error instanceof SessionAlreadyExistsError) {
        summary.skippedExisting += 1
        continue
      }
      ctx.logger.warn(`session-import-codex: import of codex thread "${record.threadId}" failed: ${String(error)}`)
    }
  }
  return { summary, sessions }
}

/**
 * Mount the import plugin: the settings section gates automatic scans, while
 * the Remote provides manual import and history to the card.
 * @param ctx - context exposing the session and persistence services.
 * @param config - loader-supplied configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config, process.env)
  const controller = new AbortController()
  ctx.effect(() => {
    return () => { controller.abort() }
  }, 'session-import-codex: abort import sweep')

  const runner = (signal: AbortSignal): Promise<CodexImportSweepResult> => runImportSweep(ctx, resolved, signal)
  const logSummary = (result: CodexImportSweepResult): void => {
    ctx.logger.info(`session-import-codex: sweep finished (imported ${result.summary.imported}, updated ${result.summary.updated}, unchanged ${result.summary.skippedExisting}, deferred-active ${result.summary.deferredActive}, skipped ${result.summary.skippedEmpty} empty)`)
  }

  // The card's manual button and history list.
  ctx.plugin(CodexImportController, { run: runner })

  // The card's sync toggle gates both its initial automatic scan and the timer.
  let autoSync = DEFAULT_CODEX_IMPORT_SETTINGS.autoSync
  let interval: ReturnType<typeof setInterval> | undefined
  const stopSync = (): void => {
    if (interval !== undefined) {
      clearInterval(interval)
      interval = undefined
    }
  }
  const startSync = (): void => {
    stopSync()
    if (!autoSync || resolved.syncIntervalMs === 0) return
    interval = setInterval(() => {
      void runner(controller.signal).then(logSummary)
    }, resolved.syncIntervalMs)
  }
  ctx.effect(() => () => { stopSync() }, 'session-import-codex: sync timer')
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, CODEX_IMPORT_NS, CodexImportSettingsSchema, DEFAULT_CODEX_IMPORT_SETTINGS, {
      setSource: () => {},
      onChange: () => {
        const value = settingsCtx.settings.get(CODEX_IMPORT_NS) as CodexImportSettings | undefined
        const nextAutoSync = value?.autoSync ?? DEFAULT_CODEX_IMPORT_SETTINGS.autoSync
        const becameEnabled = nextAutoSync && !autoSync
        autoSync = nextAutoSync
        startSync()
        if (becameEnabled) void runner(controller.signal).then(logSummary)
      },
    })
  })
}
