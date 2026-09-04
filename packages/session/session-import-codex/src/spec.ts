/**
 * Durable storage-domain declaration for Codex-import run history. The card
 * reads this history to render past runs; it never touches the session log.
 * @module @deepseek-ai/dsh-session-import-codex/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { CodexImportRun, CodexImportSession } from './types.ts'

/** Runtime schema for one imported session within a run record. */
export const codexImportSessionSchema = z.object({
  id: z.string().min(1).transform(value => value as CodexImportSession['id']),
  title: z.string(),
}) satisfies z.ZodType<CodexImportSession>

/** Runtime schema for the durable run record. */
export const codexImportRunSchema = z.object({
  at: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  imported: z.number().int().nonnegative(),
  skippedExisting: z.number().int().nonnegative(),
  skippedEmpty: z.number().int().nonnegative(),
  sessions: z.array(codexImportSessionSchema),
}) satisfies z.ZodType<CodexImportRun>

/** Durable run record inferred from {@link codexImportRunSchema}. */
export type CodexImportRunRecord = z.infer<typeof codexImportRunSchema>

/** One Codex-import sidecar domain: a `runs` table keyed by run time. */
export const codexImportDomainSpec = defineDomain({
  name: 'codex_import',
  version: 0,
  tables: {
    runs: domainTable<string, CodexImportRunRecord>(codexImportRunSchema),
  },
})
