/**
 * Public type vocabulary of the workspace entity: the `WorkspaceId` brand and
 * the `Workspace` consumer interface. Types only — the `WorkspaceId` factory
 * lives in `index.ts` (this file carries no runtime code).
 * @module @deepseek-ai/dsh-workspace/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/**
 * Identifies one workspace record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
export type WorkspaceId = Branded<'WorkspaceId'>

/**
 * Identifies one project record. A generated uuid; the display name can be
 * rewritten and roots can change, so the anchor stays stable.
 */
export type ProjectId = Branded<'ProjectId'>

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No registration carries that Workspace identity. */
    'workspace/not-found': { readonly workspaceId: WorkspaceId }
    /** No registration carries that Project identity. */
    'project/not-found': { readonly projectId: ProjectId }
  }
}

/**
 * One workspace: a stable id over an existing directory, a display title, and
 * an ordered account of sessions. The directory is the default location for
 * new sessions and the Explorer target; membership is an explicit, durable
 * account and does not require a session's cwd to equal {@link path}.
 * Consumers only see this interface; the implementation stays private.
 */
export interface Workspace {
  /** Stable record id (generated uuid). */
  readonly id: WorkspaceId

  /**
   * Canonical directory path: the `fs.realpath` of the path given at create
   * time (trailing slashes, `..`, and symlinks all resolved). Never rewritten
   * afterwards, even when the directory disappears (see {@link status}).
   */
  readonly path: string

  /** Display title. Defaults to `basename(path)` at create; duplicates are allowed. */
  readonly title: string

  /** ISO-8601 creation instant, stamped at create and never rewritten. */
  readonly createdAt: string

  /** ISO-8601 instant of the last durable mutation (create counts as one). */
  readonly updatedAt: string

  /**
   * Explicitly accounted sessions in manually owned order: a new session is
   * prepended at attach, explicit reordering goes through
   * `insertSessionBefore`, and activity never reorders. The account is not
   * filtered by cwd; a session may be moved across workspaces freely.
   */
  readonly sessionIds: readonly SessionId[]

  /**
   * Replace the display title durably.
   * @param title - New title; any string, duplicates across workspaces allowed.
   * @returns resolution after durability.
   */
  setTitle(title: string): Promise<void>

  /**
   * Prepend a session to this workspace's account. An already accounted id
   * resolves without writing. A new id must exist in the session store or
   * persistence; unknown ids reject without writing.
   * @param sessionId - The session to record.
   * @returns resolution after durability.
   */
  attachSession(sessionId: SessionId): Promise<void>

  /**
   * Move an accounted session within the manual order, DOM-insertBefore-like:
   * with an anchor the session lands before it, without one it appends to the
   * end. Only the moved id changes position. A session or anchor absent from
   * the account rejects without writing; a move to the current position
   * resolves without writing; decided on the domain write chain.
   * @param sessionId - The accounted session to move.
   * @param beforeSessionId - Accounted anchor to insert before; omitted appends.
   * @returns resolution after durability.
   */
  insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>

  /**
   * Remove a session from this workspace's account. Idempotent: an id not on
   * the account resolves without writing; decided on the domain write chain
   * like attach. Never touches the session's own stored log.
   * @param sessionId - The session to remove.
   * @returns resolution after durability.
   */
  detachSession(sessionId: SessionId): Promise<void>

  /**
   * Live directory check, uncached: whether {@link path} currently exists and
   * is a directory. A missing directory never mutates the record — the
   * directory may only be temporarily moved.
   * @returns `'ok'` when the directory exists, `'missing-dir'` otherwise.
   */
  status(): Promise<'ok' | 'missing-dir'>
}

/**
 * One project: a stable id over a display name and an ordered list of
 * directory roots. Workspaces group under the project whose longest root
 * prefixes their canonical path; roots may span several directories so one
 * logical project can own multiple checkout directories.
 */
export interface Project {
  /** Stable record id (generated uuid). */
  readonly id: ProjectId

  /** Display name shown in the sidebar project tier. */
  readonly name: string

  /** Ordered directory roots, in user order. */
  readonly roots: readonly string[]

  /** ISO-8601 creation instant. */
  readonly createdAt: string

  /** ISO-8601 instant of the last durable mutation. */
  readonly updatedAt: string

  /**
   * Replace the display name durably.
   * @param name - New name; any non-empty string, duplicates allowed.
   * @returns resolution after durability.
   */
  setName(name: string): Promise<void>

  /**
   * Replace the ordered directory roots durably.
   * @param roots - New ordered root paths.
   * @returns resolution after durability.
   */
  setRoots(roots: readonly string[]): Promise<void>
}
