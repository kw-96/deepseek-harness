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

export const fsReadValue = z.object({
  kind: z.union([z.literal('missing'), z.literal('binary'), z.literal('text')]),
  content: z.string(), size: z.number(), truncated: z.boolean(),
}).readonly()

export const fsNameSearchValue = z.object({
  matches: z.array(z.object({ path: z.string(), isDir: z.boolean() }).readonly()).readonly(),
  truncated: z.boolean(),
}).readonly()

export const fsContentSearchValue = z.object({
  matches: z.array(z.object({ path: z.string(), line: z.number(), content: z.string() }).readonly()).readonly(),
  truncated: z.boolean(),
}).readonly()

export const codexOk = z.object({ ok: z.literal(true) }).readonly()

export const gitStatusValue = z.object({
  isRepo: z.boolean(),
  branch: z.string().nullable(),
  entries: z.array(z.object({ path: z.string(), xy: z.string() }).readonly()).readonly(),
}).readonly()

export const gitLogEntry = z.object({
  hash: z.string(), subject: z.string(), author: z.string(), date: z.string(), refs: z.string(),
}).readonly()

export const gitLogValue = z.object({ entries: z.array(gitLogEntry).readonly() }).readonly()

export const gitBranchValue = z.object({
  current: z.string().nullable(), names: z.array(z.string()).readonly(),
}).readonly()

export const projectDirsValue = z.object({ dirs: z.array(z.string()).readonly() }).readonly()

export const projectAddValue = z.object({ dirs: z.array(z.string()).readonly(), rejected: z.string().nullable() }).readonly()

/** Directory listing request/response. */
export interface FsListRequest { path: string }
export interface FsListResponse { entries: readonly FsListEntry[]; truncated: boolean }
/** Read request/response. */
export interface FsReadRequest { path: string; maxBytes?: number }
export interface FsReadResponse { kind: 'missing' | 'binary' | 'text'; content: string; size: number; truncated: boolean }
export interface FsWriteRequest { path: string; content: string }
export interface FsWriteResponse { ok: true }
export interface FsNameSearchRequest { root: string; query: string }
export interface FsNameSearchResponse { matches: readonly { path: string; isDir: boolean }[]; truncated: boolean }
export interface FsContentSearchRequest { root: string; query: string }
export interface FsContentSearchResponse {
  matches: readonly { path: string; line: number; content: string }[]
  truncated: boolean
}
export interface GitStatusRequest { cwd: string }
export interface GitStatusResponse { isRepo: boolean; branch: string | null; entries: readonly { path: string; xy: string }[] }
export interface GitLogRequest { cwd: string; count?: number }
export interface GitLogResponse { entries: readonly { hash: string; subject: string; author: string; date: string; refs: string }[] }
export interface GitDiffRequest { cwd: string; path?: string; staged?: boolean }
export interface GitDiffResponse { text: string }
export interface GitSimpleRequest { cwd: string; path?: string }
export interface GitSimpleResponse { ok: true }
export interface GitCommitRequest { cwd: string; message: string }
export interface GitCommitResponse { ok: true }
export interface GitBranchesRequest { cwd: string }
export interface GitBranchesResponse { current: string | null; names: readonly string[] }
export interface GitCheckoutRequest { cwd: string; branch: string }
export interface GitCheckoutResponse { ok: true }
export interface ProjectDirsRequest { workspaceId: string }
export interface ProjectDirsResponse { dirs: readonly string[] }
export interface ProjectSetDirsRequest { workspaceId: string; dirs: readonly string[] }
export interface ProjectSetDirsResponse { dirs: readonly string[] }
export interface ProjectAddDirRequest { workspaceId: string; path: string }
export interface ProjectAddDirResponse { dirs: readonly string[]; rejected: string | null }
