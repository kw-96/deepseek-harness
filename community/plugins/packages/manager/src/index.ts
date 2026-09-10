/** Host service for persistent DeepSeek Harness plugin enablement. */

import type { Context, FiberState } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { packageRoot } from './host/package-name.js'
import { AUTOMATIC_CATEGORIES, declaredGroup, OFFICIAL_CATEGORY, packageDescription, pluginCategory } from './host/plugin-category.js'
import { officialDescription, officialGroup } from './host/official-package-index.js'
import { profileLocation, writeDesiredState, type ProfileLocation } from './host/profile-patches.js'
import {
  listMcpServers, mcpConfigId, removeMcpServer, saveMcpServer, setMcpServerEnabled,
} from './host/mcp-servers.js'
import { listSkills, setSkillModelInvocation } from './host/skills.js'
import type {
  ManagedPluginEntry,
  McpMutationReceipt,
  McpServerInput,
  McpServersSnapshot,
  MutationItem,
  MutationReceipt,
  PluginCategory,
  PluginManagerSnapshot,
  PluginPhase,
  SkillMutationReceipt,
  SkillsSnapshot,
} from './types.js'

export type * from './types.js'

const SELF_MODULE = 'dsh-plugin-manager'
/**
 * Entry ids the manager's bundle patch replaces. Their `settings.plugins.tab`
 * contribution reuses the manager's own tab id, so a re-enabled entry fails
 * the Loader on the occupied slot cell.
 */
const REPLACED_ENTRY_IDS = new Set([
  'ui-settings-plugin-inventory',
])
const DEFAULT_PROTECTED_IDS = new Set([
  'api-gateway',
  'api-remotes',
  'connection',
  'client-hmr',
  'client-locale',
  'client-modules',
  'client-runtime',
  'cordis-host-runner',
  'hmr',
  'include',
  'locale',
  'modules',
  'runtime',
  'timer',
  'ui-settings',
  'ui-settings-general',
  'ui-settings-plugins',
  'webserver',
])

const FIBER_PHASE: Record<number, PluginPhase> = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: null,
  5: 'unloading',
}

/** Plugin manager configuration. */
export interface Config {
  /** Additional local Loader entry ids that cannot be changed from the UI. */
  protectedEntries?: readonly string[]
  /** Maximum time to wait for the existing profile HMR watcher. */
  settleTimeoutMs?: number
}

/** Loader-validated configuration for profile-owned manager settings. */
export const Config = z.object({
  protectedEntries: z.array(z.string().min(1)).default([]),
  settleTimeoutMs: z.number().int().min(100).max(60_000).default(8_000),
})

/** Persistent plugin management Remote for a trusted Harness Web client. */
export class PluginManager extends TypertRemoteService {
  static inject = ['loader']

  private readonly protectedIds: ReadonlySet<string>
  private readonly location: ProfileLocation
  private readonly settleTimeoutMs: number
  private mutationTail: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'pluginManager')
    const resolvedConfig = Config.parse(config)
    this.protectedIds = new Set([...DEFAULT_PROTECTED_IDS, ...resolvedConfig.protectedEntries])
    this.settleTimeoutMs = resolvedConfig.settleTimeoutMs
    const baseUrl = ctx.loader.ctx.baseUrl
    if (baseUrl === undefined) throw new Error('dsh-plugin-manager requires a file-backed Loader root')
    this.location = profileLocation(baseUrl)
  }

  /** Read the current Loader without maintaining a second lifecycle cache. */
  @Remote('list')
  list(): PluginManagerSnapshot {
    const entries = [...this.ctx.loader.entries()]
      .filter(entry => !entry.options.group)
      .map(entry => this.project(entry))
    return {
      profileName: this.location.profileName,
      categories: AUTOMATIC_CATEGORIES,
      entries,
    }
  }

  /** Persist and apply one entry's desired enablement. */
  @Remote('setEnabled')
  async setEnabled(entryId: string, enabled: boolean): Promise<MutationReceipt> {
    return await this.serialize(async () => {
      const entry = this.ctx.loader.resolve(entryId)
      const projected = this.project(entry)
      const item = await this.change(projected, enabled)
      return { enabled, items: [item], snapshot: this.list() }
    })
  }

  /** Persist and apply all mutable entries from one automatic category. */
  @Remote('setCategoryEnabled')
  async setCategoryEnabled(category: PluginCategory, enabled: boolean): Promise<MutationReceipt> {
    return await this.serialize(async () => {
      const snapshot = this.list()
      if (!snapshot.categories.includes(category)) throw new Error(`unknown plugin category ${JSON.stringify(category)}`)
      const targets = snapshot.entries.filter(entry => entry.category === category)
      const items: MutationItem[] = []
      for (const target of targets) items.push(await this.change(target, enabled))
      return { enabled, items, snapshot: this.list() }
    })
  }

  /** Persist and apply all mutable entries from one package-like group. */
  @Remote('setPackageEnabled')
  async setPackageEnabled(packageName: string, enabled: boolean): Promise<MutationReceipt> {
    return await this.serialize(async () => {
      const targets = this.list().entries.filter(entry => entry.packageName === packageName)
      if (targets.length === 0) throw new Error(`unknown plugin package ${JSON.stringify(packageName)}`)
      const items: MutationItem[] = []
      for (const target of targets) items.push(await this.change(target, enabled))
      return { enabled, items, snapshot: this.list() }
    })
  }

  /** List every mcp-client patch row (managed and user-authored). */
  @Remote('listMcpServers')
  async listMcpServersRemote(): Promise<McpServersSnapshot> {
    return await listMcpServers(this.location)
  }

  /** Create or update one manager-owned MCP server row and settle it live. */
  @Remote('saveMcpServer')
  async saveMcpServerRemote(input: McpServerInput, enabled: boolean): Promise<McpMutationReceipt> {
    return await this.serialize(async () => {
      const receipt = await saveMcpServer(this.location, input, enabled)
      if (receipt.status !== 'changed') return receipt
      if (!enabled) return { ...receipt, message: null }
      try {
        await this.waitForMcp(input.serverName, enabled)
        return receipt
      } catch (error) {
        return {
          status: 'restart-required',
          message: `The MCP row was saved but did not settle at runtime. Restart the ${this.location.profileName} profile to apply it. ${error instanceof Error ? error.message : String(error)}`,
          snapshot: receipt.snapshot,
        }
      }
    })
  }

  /** Remove one manager-owned MCP server row. */
  @Remote('removeMcpServer')
  async removeMcpServerRemote(serverName: string): Promise<McpMutationReceipt> {
    return await this.serialize(async () => removeMcpServer(this.location, serverName))
  }

  /** Enable or disable one manager-owned MCP server row and settle it live. */
  @Remote('setMcpServerEnabled')
  async setMcpServerEnabledRemote(serverName: string, enabled: boolean): Promise<McpMutationReceipt> {
    return await this.serialize(async () => {
      const receipt = await setMcpServerEnabled(this.location, serverName, enabled)
      if (receipt.status !== 'changed') return receipt
      try {
        await this.waitForMcp(serverName, enabled)
        return receipt
      } catch (error) {
        return {
          status: 'restart-required',
          message: `The desired state was saved but did not settle at runtime. Restart the ${this.location.profileName} profile to apply it. ${error instanceof Error ? error.message : String(error)}`,
          snapshot: receipt.snapshot,
        }
      }
    })
  }

  /** List every skill under the user skill root. */
  @Remote('listSkills')
  async listSkillsRemote(): Promise<SkillsSnapshot> {
    return await listSkills()
  }

  /** Enable or disable model invocation for one skill. */
  @Remote('setSkillModelInvocation')
  async setSkillModelInvocationRemote(skillName: string, enabled: boolean): Promise<SkillMutationReceipt> {
    return await this.serialize(async () => setSkillModelInvocation(skillName, enabled))
  }

  private project(entry: Entry): ManagedPluginEntry {
    const self = packageRoot(entry.options.name) === SELF_MODULE
    const protectedById = this.protectedIds.has(entry.options.id)
    const protectsManager = this.isManagerAncestor(entry)
    const protectionReason = self
      ? 'The plugin manager cannot disable itself.'
      : protectsManager
        ? 'This entry owns the plugin manager lifecycle.'
      : REPLACED_ENTRY_IDS.has(entry.options.id)
        ? 'This entry is replaced by the plugin manager and cannot be enabled alongside it.'
      : protectedById
        ? 'This entry is required by profile reload or the Web management surface.'
        : null
    const fiber = entry.fiber as (Entry['fiber'] & { error?: unknown }) | undefined
    const packageName = packageRoot(entry.options.name)
    const category = pluginCategory(packageName)
    const group = category === OFFICIAL_CATEGORY
      ? officialGroup(packageName) ?? 'other'
      : declaredGroup(packageName, this.location.directory) ?? 'ungrouped'
    const description = category === OFFICIAL_CATEGORY
      ? officialDescription(packageName) ?? null
      : packageDescription(packageName, this.location.directory)
    return {
      entryId: entry.id,
      configId: entry.options.id,
      moduleName: entry.options.name,
      packageName,
      category,
      group,
      description,
      enabled: !entry.disabled,
      phase: fiber === undefined ? null : FIBER_PHASE[fiber.state] ?? null,
      protected: protectionReason !== null,
      protectionReason,
      error: fiber?.error === undefined ? null : String(fiber.error),
    }
  }

  private async change(entry: ManagedPluginEntry, enabled: boolean): Promise<MutationItem> {
    if (entry.protected) return { entryId: entry.entryId, status: 'skipped', message: entry.protectionReason }
    if (entry.enabled === enabled) return { entryId: entry.entryId, status: 'unchanged', message: null }
    if (this.hasAmbiguousConfigId(entry)) {
      return { entryId: entry.entryId, status: 'failed', message: `Config id ${entry.configId} is not unique in this Loader tree.` }
    }
    try {
      await writeDesiredState(this.location, entry.configId, entry.moduleName, enabled)
    } catch (error) {
      return { entryId: entry.entryId, status: 'failed', message: error instanceof Error ? error.message : String(error) }
    }
    try {
      await this.waitFor(entry.entryId, enabled)
      return { entryId: entry.entryId, status: 'changed', message: null }
    } catch (error) {
      return {
        entryId: entry.entryId,
        status: 'restart-required',
        message: `The desired state was saved but did not settle at runtime. Restart the ${this.location.profileName} profile to apply it. ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private isManagerAncestor(candidate: Entry): boolean {
    const manager = [...this.ctx.loader.entries()].find(entry => packageRoot(entry.options.name) === SELF_MODULE)
    if (manager === undefined) return false
    let ancestor = manager.parent.ctx.fiber.entry
    while (ancestor !== undefined) {
      if (ancestor === candidate) return true
      ancestor = ancestor.parent.ctx.fiber.entry
    }
    return false
  }

  private hasAmbiguousConfigId(target: ManagedPluginEntry): boolean {
    return this.list().entries.filter(entry => entry.configId === target.configId).length > 1
  }

  private async waitFor(entryId: string, enabled: boolean): Promise<void> {
    const deadline = Date.now() + this.settleTimeoutMs
    while (Date.now() < deadline) {
      const entry = this.ctx.loader.resolve(entryId)
      if (!entry.disabled === enabled && entry._initTask === undefined && entry._disposing === 0) return
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error(`Timed out waiting for ${entryId} to become ${enabled ? 'enabled' : 'disabled'}.`)
  }

  /** 等待 mcp-<serverName> 条目在 Loader 中达到目标启停状态（热应用或判定需重启）。 */
  private async waitForMcp(serverName: string, enabled: boolean): Promise<void> {
    const entryId = mcpConfigId(serverName)
    const deadline = Date.now() + this.settleTimeoutMs
    while (Date.now() < deadline) {
      let resolved: boolean
      try {
        const entry = this.ctx.loader.resolve(entryId)
        resolved = !entry.disabled === enabled && entry._initTask === undefined && entry._disposing === 0
      } catch {
        resolved = !enabled
      }
      if (resolved) return
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error(`Timed out waiting for MCP server ${serverName} to become ${enabled ? 'enabled' : 'disabled'}.`)
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail
    let release!: () => void
    this.mutationTail = new Promise<void>(resolve => { release = resolve })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }
}

export default PluginManager
