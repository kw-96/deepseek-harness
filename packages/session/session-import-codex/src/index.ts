/**
 * Import local Codex threads as DSH sessions. On host start the plugin sweeps
 * Codex's thread-history store once, converts every thread into a DSH event
 * log, stores it durably, and publishes it as a live session so the Web GUI
 * session list shows it. The sweep is idempotent: a thread whose `codex-<id>`
 * session already exists — live or stored — is skipped, so later Codex
 * activity requires no import run unless the stored session is deleted.
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
import type { CodexImportSession, CodexImportSweepResult, ImportBounds } from './types.ts'

export { CodexImportController } from './remote.ts'
export type { CodexImportControllerConfig, CodexImportRunner } from './remote.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    codexImport: import('./remote.ts').CodexImportController
  }
}

export type { CodexImportSummary } from './types.ts'

export const name = 'session-import-codex'
export const inject = ['sessions', 'sessionPersistence']

/** Default cap for imported tool-result text. */
export const DEFAULT_MAX_TOOL_RESULT_CHARS = 20_000

/** Default cap for an imported Codex thread title. */
export const DEFAULT_MAX_TITLE_CHARS = 300

/** Plugin configuration: Codex source location and import caps. */
export interface Config {
  /**
   * Codex home directory (the directory containing `thread_history_1.sqlite`
   * and `session_index.jsonl`). Omitted to resolve from `CODEX_HOME`, then
   * `~/.codex`.
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
   * on. `0` (the default) disables the timer; the boot sweep and the manual
   * button still run regardless.
   */
  syncIntervalMs?: number
}

export const Config: z<Config> = z.object({
  codexHome: z.string().min(1),
  cwd: z.string().min(1),
  maxToolResultChars: z.number().step(1).min(1).default(DEFAULT_MAX_TOOL_RESULT_CHARS),
  maxTitleChars: z.number().step(1).min(1).default(DEFAULT_MAX_TITLE_CHARS),
  syncIntervalMs: z.number().step(1).min(0).default(0),
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
    syncIntervalMs: config.syncIntervalMs ?? 0,
  }
}

/** The fixed prefix every imported session id carries. */
const IMPORTED_ID_PREFIX = 'codex-'

/** The imported session id derived from one Codex thread id. */
function importedSessionId(threadId: string): SessionId {
  return SessionId(`${IMPORTED_ID_PREFIX}${threadId}`)
}

/**
 * Store one converted thread durably and publish it as a live session.
 * @param ctx - context exposing the session and persistence services.
 * @param record - converted events and header cwd.
 * @param threadId - source Codex thread id, used for ids and diagnostics.
 * @param fallbackCwd - absolute cwd substituted when the converted cwd is not absolute.
 * @returns the imported session's id and display title.
 */
async function importOneThread(
  ctx: Context,
  record: ReturnType<typeof convertCodexThread>,
  threadId: string,
  fallbackCwd: string,
): Promise<CodexImportSession> {
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
  }
  const handle = await ctx.sessionPersistence.create(header)
  try {
    await handle.append(record.events)
    await handle.flush()
  } finally {
    await handle.close()
  }
  ctx.sessions.create(id, {
    seed: structuredClone(record.events),
    meta: { cwd, createdAt },
  })
  let title = ''
  for (const event of record.events) {
    if (event.type === 'session/title') {
      title = event.data.title
      break
    }
  }
  return { id, title }
}

/**
 * Run one idempotent import sweep over the Codex thread store. Never rejects:
 * a missing or unreadable store, a failed conversion, and a failed write are
 * all logged and counted instead.
 * @param ctx - context exposing the session and persistence services.
 * @param config - resolved Codex location and caps.
 * @param signal - aborts the sweep between threads.
 * @returns the per-thread outcome counts plus the sessions this sweep imported.
 */
export async function runImportSweep(
  ctx: Context,
  config: ResolvedConfig,
  signal: AbortSignal,
): Promise<CodexImportSweepResult> {
  const summary = { imported: 0, skippedExisting: 0, skippedEmpty: 0 }
  const sessions: CodexImportSession[] = []
  let records
  try {
    records = await loadCodexThreads(config.codexHome)
  } catch (error: unknown) {
    ctx.logger.warn(`session-import-codex: could not read the Codex thread store at ${JSON.stringify(config.codexHome)}: ${String(error)}`)
    return { summary, sessions }
  }
  if (records === undefined) {
    ctx.logger.info(`session-import-codex: no Codex thread store at ${JSON.stringify(join(config.codexHome, 'thread_history_1.sqlite'))}; nothing to import`)
    return { summary, sessions }
  }
  for (const record of records) {
    if (signal.aborted) break
    const id = importedSessionId(record.threadId)
    if (ctx.sessions.get(id) !== undefined) {
      summary.skippedExisting += 1
      continue
    }
    try {
      if (await ctx.sessionPersistence.stat(id) !== undefined) {
        summary.skippedExisting += 1
        continue
      }
    } catch {
      // A failed stat is not proof of absence; try the write and let the
      // already-exists rejection decide.
    }
    const converted = convertCodexThread(record, config.cwd, config.bounds)
    if (converted.events.length === 0) {
      summary.skippedEmpty += 1
      continue
    }
    try {
      const created = await importOneThread(ctx, converted, record.threadId, config.cwd)
      summary.imported += 1
      sessions.push(created)
      ctx.logger.info(`session-import-codex: imported codex thread "${record.threadId}" as "${created.id}" (${converted.events.length} events)`)
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
 * Mount the import plugin: an always-on boot sweep, the settings section that
 * drives the card's sync toggle and periodic re-scan, and the Remote surface
 * for the card's manual button and history.
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
    ctx.logger.info(`session-import-codex: sweep finished (imported ${result.summary.imported}, skipped ${result.summary.skippedExisting} existing, skipped ${result.summary.skippedEmpty} empty)`)
  }

  // The card's manual button and history list.
  ctx.plugin(CodexImportController, { run: runner })

  // The card's sync toggle: autoSync gates only the periodic re-scan. The boot
  // sweep below stays unconditional (idempotent), so an install still imports
  // the existing history before the user ever opens settings.
  let autoSync = true
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
        autoSync = value?.autoSync ?? true
        startSync()
      },
    })
  })

  // Always-on, idempotent boot sweep (historical behavior).
  void runner(controller.signal).then(logSummary)
}
