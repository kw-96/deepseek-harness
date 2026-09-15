/**
 * Profile manifest helpers for community/seed.mjs: turn the checked-in
 * template into the manifest this host can install, and repair a manifest an
 * earlier checkout wrote from a different repository path or another machine.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { GITHUB_BUNDLES, INTERNAL_BUNDLES, NATIVE_BUNDLE_LIMITS, tarballAvailable } from './preflight.mjs'

/** Placeholder seed substitutes with this checkout's tarballs directory. */
export const TARBALLS_TOKEN = '__COMMUNITY_TARBALLS__'

/** Path fragment identifying a dependency pinned to a community tarball. */
const TARBALLS_MARKER = '/community/plugins/tarballs/'

/** Dependency specifiers that never resolve through an npm registry. */
const NON_REGISTRY = ['file:', 'github:', 'link:', 'workspace:', 'portal:', 'http:', 'https:']

/** Exact versions only: a range has no single tarball to probe. */
const EXACT_VERSION = /^\d+\.\d+\.\d+/

/**
 * Template bundles this host must not receive, each with the reason shown to
 * the user.
 * @param host - `{ internal, githubReachable, platform, arch }` probe results.
 * @returns dropped bundle name to Chinese reason.
 */
export function droppedBundles(host) {
  const dropped = new Map()
  if (!host.internal) {
    for (const name of INTERNAL_BUNDLES) dropped.set(name, '只存在于网易内部 registry')
  }
  if (!host.githubReachable) {
    for (const name of GITHUB_BUNDLES) dropped.set(name, '依赖从 github.com 直接下载，当前网络无法访问')
  }
  for (const limit of NATIVE_BUNDLE_LIMITS) {
    if (limit.unsupported(host.platform, host.arch)) dropped.set(limit.name, limit.detail)
  }
  return dropped
}

/**
 * Pinned registry dependencies the chosen registry can no longer serve, so a
 * seeded profile never installs into a guaranteed failure.
 * @param template - the parsed checked-in profile template.
 * @param registry - registry base URL seed writes into `.npmrc`.
 * @param dropped - bundles already dropped for this host.
 * @returns dropped bundle name to Chinese reason.
 */
export async function unavailablePinned(template, registry, dropped) {
  const unavailable = new Map()
  for (const [name, spec] of Object.entries(template.dependencies ?? {})) {
    if (dropped.has(name)) continue
    if (NON_REGISTRY.some(prefix => spec.startsWith(prefix))) continue
    if (!EXACT_VERSION.test(spec)) continue
    if (await tarballAvailable(registry, name, spec)) continue
    unavailable.set(name, `所选 registry 已不再提供 ${name}@${spec}，该包可能已被作者下架`)
  }
  return unavailable
}

/**
 * The directories a profile bundle may resolve from, most authoritative first:
 * the dsh installation (`apps/cli`, the same anchor profile boot uses), the
 * profile directory itself, then the shared profiles fallback the boot heals.
 * @param paths - `{ repoRoot, profileDir, dshHome }` absolute directories.
 * @returns the anchor directories, in resolution order.
 */
export function bundleAnchors({ repoRoot, profileDir, dshHome }) {
  return [join(repoRoot, 'apps', 'cli'), profileDir, join(dshHome, 'profiles')]
}

/**
 * Bundles the profile lists but nothing can supply: no dependency entry in the
 * manifest, and no package resolvable from any anchor. `dsh-plugin-manager`
 * writes such rows from its catalog, and a row nothing declares fails at boot
 * with ERR_MODULE_NOT_FOUND.
 * @param pkg - the parsed profile manifest.
 * @param anchors - directories to resolve from, as `bundleAnchors` returns.
 * @returns dropped bundle name to Chinese reason.
 */
export function unresolvableBundles(pkg, anchors) {
  const dropped = new Map()
  const dependencies = pkg.dependencies ?? {}
  for (const name of pkg.dsh.profile.bundles ?? []) {
    if (dependencies[name] !== undefined) continue
    if (anchors.some(anchor => resolvableFrom(anchor, name))) continue
    dropped.set(name, '没有任何依赖声明，也无法从 dsh 安装或 profile 中解析出该包')
  }
  return dropped
}

/**
 * Whether a package resolves from one anchor directory, following Node's own
 * node_modules lookup order so the answer matches what the Loader will import.
 * @param anchor - absolute directory whose package.json anchors the search.
 * @param name - package name to resolve.
 * @returns true when a package.json for that name exists on the search path.
 */
function resolvableFrom(anchor, name) {
  const searchPaths = createRequire(join(anchor, 'package.json')).resolve.paths(name) ?? []
  return searchPaths.some(searchPath => existsSync(join(searchPath, name, 'package.json')))
}

/**
 * Render the manifest this host installs from the checked-in template.
 * @param template - the parsed checked-in profile template.
 * @param options - the tarballs directory and the bundles to drop.
 * @returns the manifest with the placeholder resolved and drops applied.
 */
export function materializeProfile(template, { tarballsUrl, dropped }) {
  const pkg = JSON.parse(JSON.stringify(template).replaceAll(TARBALLS_TOKEN, tarballsUrl))
  pkg.dsh.profile.bundles = (pkg.dsh.profile.bundles ?? []).filter(name => !dropped.has(name))
  for (const name of dropped.keys()) delete pkg.dependencies[name]
  return pkg
}

/**
 * Repair a manifest an earlier checkout wrote so this host converges on the
 * current template: resolve the template's tarballs placeholder and re-point
 * `file:` dependencies at this checkout's tarballs directory, drop bundles this
 * host cannot install, drop bundles the template retired, and adopt the
 * template's bundles and dependencies that are missing. Bundles and
 * dependencies a user added beyond the template are left untouched, so running
 * seed without `--force` never discards them.
 * @param pkg - the parsed profile manifest, mutated in place.
 * @param options - tarballs directory, dropped bundles, template and retired names.
 * @returns one Chinese sentence per applied change; empty when nothing changed.
 */
export function repairProfile(pkg, { tarballsUrl, dropped, template, retired = [] }) {
  const changes = []
  const dependencies = pkg.dependencies ?? {}
  pkg.dependencies = dependencies
  // One array, mutated in place: reassigning the list would leave later steps
  // filtering a stale copy and resurrecting what an earlier step removed.
  pkg.dsh.profile.bundles = pkg.dsh.profile.bundles ?? []
  const bundles = pkg.dsh.profile.bundles
  const dropBundle = (name) => {
    const at = bundles.indexOf(name)
    if (at !== -1) bundles.splice(at, 1)
  }
  // Only a fresh seed runs the template through materializeProfile, so an
  // adopted dependency reaches a repair still holding the placeholder; an
  // unresolved `file:__COMMUNITY_TARBALLS__/x.tgz` points at a directory no
  // host has, and the failing install leaves the new bundles uninstalled.
  const resolveSpec = (spec) => {
    const materialized = spec.replaceAll(TARBALLS_TOKEN, tarballsUrl)
    return relocateTarball(materialized, tarballsUrl) ?? materialized
  }
  for (const [name, spec] of Object.entries(dependencies)) {
    const expected = resolveSpec(spec)
    if (expected === spec) continue
    dependencies[name] = expected
    changes.push(`修正依赖路径 ${name} → ${expected.slice('file:'.length)}`)
  }
  for (const [name, reason] of dropped) {
    if (!bundles.includes(name) && dependencies[name] === undefined) continue
    dropBundle(name)
    delete dependencies[name]
    changes.push(`移除 ${name}（${reason}）`)
  }
  for (const name of retired) {
    if (!bundles.includes(name) && dependencies[name] === undefined) continue
    dropBundle(name)
    delete dependencies[name]
    changes.push(`下线 ${name}（新版模板已由其它插件取代）`)
  }
  for (const [name, spec] of Object.entries(template.dependencies ?? {})) {
    if (dropped.has(name) || retired.includes(name) || dependencies[name] !== undefined) continue
    dependencies[name] = resolveSpec(spec)
    changes.push(`新增依赖 ${name}`)
  }
  for (const name of template.dsh?.profile?.bundles ?? []) {
    if (dropped.has(name) || retired.includes(name) || bundles.includes(name)) continue
    bundles.push(name)
    changes.push(`新增插件 ${name}`)
  }
  return changes
}

/**
 * Copy the template's `allowBuilds` entries the profile is missing, so a new
 * plugin whose native module needs its install script allowed does not turn
 * into a failed install on an already-seeded host. Comment lines directly above
 * a copied entry travel with it; existing entries are never overwritten.
 * @param profileText - the profile's current pnpm-workspace.yaml text.
 * @param templateText - the template's pnpm-workspace.yaml text.
 * @returns the merged text, or undefined when nothing is missing.
 */
export function mergeAllowBuilds(profileText, templateText) {
  const templateBlock = allowBuildsBlock(templateText)
  if (templateBlock === undefined) return undefined
  const present = new Set((allowBuildsBlock(profileText)?.entries ?? []).map(entry => entry.key))
  const missing = templateBlock.entries.filter(entry => !present.has(entry.key))
  if (missing.length === 0) return undefined
  const lines = profileText.split(/\r?\n/)
  const block = allowBuildsBlock(profileText)
  if (block === undefined) {
    const appended = [...lines, 'allowBuilds:', ...missing.flatMap(entry => entry.lines)]
    return `${appended.join('\n').replace(/\n*$/u, '')}\n`
  }
  const merged = [...lines.slice(0, block.end), ...missing.flatMap(entry => entry.lines), ...lines.slice(block.end)]
  return merged.join('\n')
}

/**
 * Remove the profile patch rows a retired bundle left behind. Only single-line
 * `{ … }` rows are matched; a retired name still present afterwards is reported
 * by the caller so the user can remove a hand-written block row.
 * @param text - the profile's cordis.patch.yml text.
 * @param retired - retired package names.
 * @returns the filtered text and the names actually removed.
 */
export function retirePatchRows(text, retired) {
  if (retired.length === 0) return { text, removed: [] }
  const kept = []
  const removed = []
  for (const line of text.split(/\r?\n/)) {
    const name = retired.find(pkg => isFlowRowFor(line, pkg))
    if (name === undefined) {
      kept.push(line)
      continue
    }
    const previous = kept[kept.length - 1]
    if (previous !== undefined && /^#\s*Managed by /u.test(previous.trim())) kept.pop()
    removed.push(name)
  }
  return { text: kept.join('\n'), removed }
}

/**
 * Whether one line is a complete single-line patch row naming a package.
 * @param line - one line of a patch file.
 * @param packageName - the package name to match.
 * @returns true when the line is that package's flow-style row.
 */
function isFlowRowFor(line, packageName) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{') || !trimmed.includes('}')) return false
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`name:\\s*['"]?${escaped}['"]?\\s*[,}]`, 'u').test(trimmed)
}

/**
 * Locate a top-level `allowBuilds:` block and read its entries.
 * @param text - pnpm-workspace.yaml text.
 * @returns the block's end index and entries, or undefined without the block.
 */
function allowBuildsBlock(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => line.trim() === 'allowBuilds:')
  if (start === -1) return undefined
  let end = start + 1
  while (end < lines.length && (lines[end].trim() === '' || /^\s/u.test(lines[end]))) end += 1
  const entries = []
  for (let index = start + 1; index < end; index += 1) {
    const match = /^\s+['"]?([^'":]+)['"]?:\s*\S/u.exec(lines[index])
    if (match === null) continue
    const previous = lines[index - 1]
    const lines0 = previous !== undefined && /^\s*#/u.test(previous) && index - 1 > start
      ? [previous, lines[index]]
      : [lines[index]]
    entries.push({ key: match[1], lines: lines0 })
  }
  return { start, end, entries }
}

/**
 * Re-point one community-tarball dependency at the given tarballs directory,
 * keeping its file name.
 * @param spec - the dependency specifier.
 * @param tarballsUrl - this checkout's tarballs directory, forward slashes.
 * @returns the corrected specifier, or undefined when no rewrite applies.
 */
function relocateTarball(spec, tarballsUrl) {
  if (!spec.startsWith('file:')) return undefined
  const path = spec.slice('file:'.length).replaceAll('\\', '/')
  const at = path.lastIndexOf(TARBALLS_MARKER)
  if (at === -1) return undefined
  return `file:${tarballsUrl}/${path.slice(at + TARBALLS_MARKER.length)}`
}

/**
 * Serialize a profile manifest the way seed and doctor both write it.
 * @param pkg - the parsed profile manifest.
 * @returns JSON text ending in exactly one newline.
 */
export function renderProfile(pkg) {
  return `${JSON.stringify(pkg, null, 2)}\n`
}
