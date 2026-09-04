/**
 * Settings namespace backing the Codex-import card's sync toggle. The
 * namespace is the join key between the Host settings section and the browser
 * card, so it is spelled once here and mirrored in the client package.
 * @module @deepseek-ai/dsh-session-import-codex/settings
 */

import z from '@deepseek-ai/schemastery'

/** Host settings namespace keyed into the Web "Plugins" configuration tab. */
export const CODEX_IMPORT_NS = 'codex-import'

/** Settings value: whether automatic import (boot + periodic) is enabled. */
export interface CodexImportSettings {
  /** Re-scan Codex on host start and on the configured interval. */
  readonly autoSync: boolean
}

/** Loader schema resolving the namespace; the card edits `autoSync`. */
export const CodexImportSettingsSchema: z<CodexImportSettings> = z.object({
  autoSync: z.boolean().default(true),
})

/** Composition base value when no user document layer exists. */
export const DEFAULT_CODEX_IMPORT_SETTINGS: CodexImportSettings = Object.freeze({ autoSync: true })
