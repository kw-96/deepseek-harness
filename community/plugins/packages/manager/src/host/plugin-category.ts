import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginCategory } from '../types.js'
import { isOfficialPackage } from './official-package-registry.js'

export const OFFICIAL_CATEGORY = 'official'
export const THIRD_PARTY_CATEGORY = 'third-party'
export const AUTOMATIC_CATEGORIES = [OFFICIAL_CATEGORY, THIRD_PARTY_CATEGORY] as const satisfies readonly PluginCategory[]

/** Declared functional group id shape: lowercase letters, digits, dots, underscores, hyphens. */
const GROUP_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u

interface ManifestView {
  readonly name?: unknown
  readonly description?: unknown
  readonly dsh?: {
    readonly pluginManager?: {
      readonly group?: unknown
    }
  }
}

const manifestCache = new Map<string, ManifestView | null>()

/** Classify every package root against the checked-in official registry. */
export function pluginCategory(packageName: string): PluginCategory {
  return isOfficialPackage(packageName) ? OFFICIAL_CATEGORY : THIRD_PARTY_CATEGORY
}

/**
 * Read the installed package manifest for one third-party root. The profile
 * uses a hoisted `node_modules`, so a direct `<profile>/node_modules/<pkg>/
 * package.json` read is deterministic and needs no Node version-specific
 * resolver. Official roots short-circuit here because their text comes from
 * the checked-in index instead.
 */
function thirdPartyManifest(packageName: string, profileDirectory: string): ManifestView | null {
  if (isOfficialPackage(packageName)) return null
  const key = `${profileDirectory}\0${packageName}`
  const cached = manifestCache.get(key)
  if (cached !== undefined) return cached
  const value = readManifest(packageName, profileDirectory)
  manifestCache.set(key, value)
  return value
}

function readManifest(packageName: string, profileDirectory: string): ManifestView | null {
  try {
    const manifestPath = join(profileDirectory, 'node_modules', ...packageName.split('/'), 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestView
    if (manifest.name !== packageName) return null
    return manifest
  } catch {
    return null
  }
}

/**
 * Read a third-party package's `dsh.pluginManager.group` declaration when it
 * matches the group-id shape. Official groups come from the checked-in index,
 * so a publisher declaration here only affects third-party entries.
 */
export function declaredGroup(packageName: string, profileDirectory: string): string | null {
  const manifest = thirdPartyManifest(packageName, profileDirectory)
  if (manifest === null) return null
  const group = manifest.dsh?.pluginManager?.group
  return typeof group === 'string' && GROUP_ID.test(group) ? group : null
}

/**
 * Read a third-party package's `description` field for the UI caption.
 * Official descriptions come from the checked-in index, so this lookup only
 * runs for third-party roots and is a best-effort hint that never affects
 * enablement.
 */
export function packageDescription(packageName: string, profileDirectory: string): string | null {
  const manifest = thirdPartyManifest(packageName, profileDirectory)
  if (manifest === null) return null
  const description = manifest.description
  return typeof description === 'string' && description.trim() !== '' ? description.trim() : null
}
