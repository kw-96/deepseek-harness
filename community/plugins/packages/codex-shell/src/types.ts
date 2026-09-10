/** Shared wire types for the dsh-codex-shell Host Remote. */

import { z } from 'zod'

export type FsEntryKind = 'file' | 'directory' | 'other'

/** One direct child of a directory listing. */
export interface FsListEntry {
  name: string
  kind: FsEntryKind
  size: number | null
}

export const fsListEntry = z.object({
  name: z.string(), kind: z.union([z.literal('file'), z.literal('directory'), z.literal('other')]), size: z.number().nullable(),
}).readonly()

export const fsListValue = z.object({
  entries: z.array(fsListEntry).readonly(), truncated: z.boolean(),
}).readonly()

export const projectViewValue = z.object({
  projectId: z.string(),
  name: z.string(),
  roots: z.array(z.string()).readonly(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).readonly()

export const projectListValue = z.object({ projects: z.array(projectViewValue).readonly() }).readonly()

export const projectValue = z.object({ project: projectViewValue }).readonly()

export const projectDeleteValue = z.object({ deleted: z.boolean() }).readonly()

export const terminalStatusValue = z.union([
  z.object({ kind: z.literal('running') }).readonly(),
  z.object({ kind: z.literal('exited'), exitCode: z.number().nullable(), signal: z.string().nullable() }).readonly(),
]).readonly()

export const terminalOpenOptions = z.object({
  cwd: z.string().optional(),
  name: z.string().optional(),
  shellDialect: z.union([z.literal('bash'), z.literal('pwsh')]).optional(),
  cols: z.number().optional(),
  rows: z.number().optional(),
}).readonly()

export const terminalOpenValue = z.object({
  terminalId: z.string(),
  output: z.string(),
  status: terminalStatusValue,
  name: z.string().optional(),
  origin: z.union([z.literal('ui'), z.literal('agent')]),
}).readonly()

export const terminalListEntryValue = z.object({
  terminalId: z.string(),
  name: z.string().optional(),
  status: terminalStatusValue,
  origin: z.union([z.literal('ui'), z.literal('agent')]),
}).readonly()

export const terminalListValue = z.object({
  terminals: z.array(terminalListEntryValue).readonly(),
}).readonly()

export const terminalSendValue = z.object({ output: z.string(), status: terminalStatusValue, waitReason: z.string(), truncated: z.boolean() }).readonly()
export const terminalReadValue = z.object({ output: z.string(), truncated: z.boolean() }).readonly()
export const terminalFollowValue = z.object({ seq: z.number(), chunk: z.string() }).readonly()
export const terminalOkValue = z.object({ ok: z.literal(true) }).readonly()

/** Directory listing request/response (the workspace picker's browse step). */
export interface FsListRequest { path: string }
export interface FsListResponse { entries: readonly FsListEntry[]; truncated: boolean }
/** A workspace-registry project. */
export interface ProjectView {
  projectId: string
  name: string
  roots: readonly string[]
  createdAt: string
  updatedAt: string
}
export interface ProjectListResponse { projects: readonly ProjectView[] }
export interface ProjectCreateRequest { name: string; roots?: readonly string[] }
export interface ProjectValue { project: ProjectView }
export interface ProjectRenameRequest { projectId: string; name: string }
export interface ProjectSetRootsRequest { projectId: string; roots: readonly string[] }
export interface ProjectDeleteRequest { projectId: string }
export interface ProjectDeleteResponse { deleted: boolean }
export interface TerminalOpenOptions {
  cwd?: string
  name?: string
  shellDialect?: 'bash' | 'pwsh'
  cols?: number
  rows?: number
}
export interface TerminalOpenResponse {
  terminalId: string
  output: string
  status: { kind: string; exitCode?: number | null; signal?: string | null }
  name?: string
  origin: 'ui' | 'agent'
}
export interface TerminalListEntry {
  terminalId: string
  name?: string
  status: { kind: string; exitCode?: number | null; signal?: string | null }
  origin: 'ui' | 'agent'
}
export interface TerminalListResponse { terminals: readonly TerminalListEntry[] }
export interface TerminalSendResponse { output: string; status: { kind: string; exitCode?: number | null; signal?: string | null }; waitReason: string; truncated: boolean }
export interface TerminalReadResponse { output: string; truncated: boolean }
/** One interactive bottom-terminal output frame. */
export interface TerminalFollowFrame { seq: number; chunk: string }
export interface TerminalWriteResponse { ok: true }
export interface TerminalResizeResponse { ok: true }
export interface TerminalCloseResponse { ok: true }
