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
 * Repair a manifest an earlier checkout wrote: re-point `file:` dependencies
 * at this checkout's tarballs directory and drop bundles this host cannot
 * install. Bundles and dependencies a user added beyond the template are left
 * untouched, so running seed without `--force` never discards them.
 * @param pkg - the parsed profile manifest, mutated in place.
 * @param options - the tarballs directory and the bundles to drop.
 * @returns one Chinese sentence per applied change; empty when nothing changed.
 */
export function repairProfile(pkg, { tarballsUrl, dropped }) {
  const changes = []
  const dependencies = pkg.dependencies ?? {}
  for (const [name, spec] of Object.entries(dependencies)) {
    const expected = relocateTarball(spec, tarballsUrl)
    if (expected === undefined || expected === spec) continue
    dependencies[name] = expected
    changes.push(`修正依赖路径 ${name} → ${expected.slice('file:'.length)}`)
  }
  for (const [name, reason] of dropped) {
    const bundles = pkg.dsh.profile.bundles ?? []
    if (!bundles.includes(name) && dependencies[name] === undefined) continue
    pkg.dsh.profile.bundles = bundles.filter(entry => entry !== name)
    delete dependencies[name]
    changes.push(`移除 ${name}（${reason}）`)
  }
  return changes
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
