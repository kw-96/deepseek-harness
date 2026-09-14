/** Shared wire types for the dsh-codex-left Host Remote. */

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
