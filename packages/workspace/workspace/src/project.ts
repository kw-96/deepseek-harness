/**
 * Package-private project entity: the single {@link Project} implementation.
 * Holds a record snapshot swapped in place after each durable mutation; every
 * write funnels through the registry-owned table so `updatedAt` is stamped
 * exactly once. Not re-exported — consumers see only the `Project` interface.
 * @module @deepseek-ai/dsh-workspace/src/project
 */

import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { ProjectRecord } from './spec.ts'
import type { Project, ProjectId } from './types.ts'

/** The registry-owned table an entity mutates through. */
export interface ProjectEntityHost {
  /**
   * Resolve the open `projects` table.
   * @returns the table; throws while the registry has not started yet.
   */
  table(): KvTable<ProjectId, ProjectRecord>
}

/** Chain-slot abort sentinel thrown by the update fn when the record needs no change. */
const unchangedSentinel = new Error('project record unchanged (internal sentinel)')

/** The single {@link Project} implementation; constructed only by the registry. */
export class ProjectEntity implements Project {
  private record: ProjectRecord

  /**
   * @param host - Registry-owned projects table.
   * @param id - The record's stable id.
   * @param record - The validated record snapshot loaded or just written.
   */
  constructor(
    private readonly host: ProjectEntityHost,
    readonly id: ProjectId,
    record: ProjectRecord,
  ) {
    this.record = record
  }

  get name(): string {
    return this.record.name
  }

  get roots(): readonly string[] {
    return this.record.roots
  }

  get createdAt(): string {
    return this.record.createdAt
  }

  get updatedAt(): string {
    return this.record.updatedAt
  }

  async setName(name: string): Promise<void> {
    await this.mutate(record => ({ ...record, name }))
  }

  async setRoots(roots: readonly string[]): Promise<void> {
    await this.mutate(record => ({ ...record, roots: [...roots] }))
  }

  /** The single write path: stamp `updatedAt` and swap the snapshot. */
  private async mutate(fn: (record: ProjectRecord) => ProjectRecord): Promise<void> {
    let next: ProjectRecord
    try {
      next = await this.host.table().update(this.id, (current) => {
        const changed = fn(current)
        if (changed === current) throw unchangedSentinel
        return { ...changed, updatedAt: new Date().toISOString() }
      })
    } catch (error) {
      if (error === unchangedSentinel) return
      throw error
    }
    this.record = next
  }
}
