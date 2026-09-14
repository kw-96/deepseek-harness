/**
 * Make the carried Harness profile relocatable and reproducible.
 *
 * A host profile reaches a clean machine only after three repairs. The Cordis
 * HMR row the community dev tooling writes points at a plugin source tree a
 * deployment does not carry. Dependency paths the host wrote as absolute
 * `file:` paths into its checkout stop resolving once the package is extracted
 * elsewhere, so every such path is rewritten relative to the profile — in the
 * manifest and in the lockfile together, because a frozen install requires the
 * two to agree on the exact specifier string. And a pinned version the registry
 * no longer publishes makes the profile unreproducible for anyone, so it is
 * repacked from the host's installed copy rather than silently moved.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { flattenName, repackTarball } from './tarballs.mjs'

/** How far above a profile its package root sits: `<root>/dsh-home/profiles/web`. */
const PROFILE_DEPTH = '../../../'

/** Dependency specifiers that never resolve through an npm registry. */
const NON_REGISTRY = /^(?:file:|github:|link:|workspace:|portal:|https?:)/u

/** Exact version pins only; a range has no single version to check. */
const EXACT_VERSION = /^\d+\.\d+\.\d+/u

/**
 * Read one JSON file.
 * @param path - absolute file path.
 * @returns the parsed value.
 */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Rewrite absolute `file:` paths under any of `roots` to a path relative to the
 * profile, in the manifest and the lockfile together.
 * @param options - `{ profileDir, roots }`.
 * @returns the number of rewritten occurrences.
 */
export function rewritePackageRootPaths({ profileDir, roots }) {
  const prefixes = roots
    .map(root => `file:${resolve(root).replaceAll('\\', '/').replace(/\/$/u, '')}/`)
    .filter((prefix, index, all) => all.indexOf(prefix) === index)
  let total = 0
  for (const file of ['package.json', 'pnpm-lock.yaml']) {
    const path = join(profileDir, file)
    if (!existsSync(path)) continue
    const original = readFileSync(path, 'utf8')
    let updated = original
    for (const prefix of prefixes) {
      const replacements = updated.split(prefix).length - 1
      if (replacements === 0) continue
      updated = updated.replaceAll(prefix, `file:${PROFILE_DEPTH}`)
      total += replacements
    }
    if (updated !== original) writeFileSync(path, updated, 'utf8')
  }
  return total
}

/**
 * Drop the Cordis HMR row the community dev tooling writes into a profile's
 * patch layer. It points HMR at a plugin source tree, which a deployment does
 * not carry, and it exists only to hot-reload that tree.
 * @param options - `{ profileDir }`.
 * @returns one Chinese sentence when a row was removed; empty otherwise.
 */
export function stripCommunityDevHmrPatch({ profileDir }) {
  const path = join(profileDir, 'cordis.patch.yml')
  if (!existsSync(path)) return []
  const marker = '# Managed by community dev: enable Cordis HMR for linked plugins.'
  const lines = readFileSync(path, 'utf8').split(/\r?\n/u)
  const kept = []
  let removed = 0
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== marker) {
      kept.push(lines[index])
      continue
    }
    const end = lines.findIndex((line, candidate) => candidate > index && line.trim() === '},')
    if (end === -1 || end - index > 12) {
      kept.push(lines[index])
      continue
    }
    removed += 1
    index = end
  }
  if (removed === 0) return []
  writeFileSync(path, kept.join('\n'), 'utf8')
  return [`已从 profile 补丁移除开发专用的 HMR 行（${removed} 处）`]
}

/**
 * Read the registry the profile installs from.
 * @param profileDir - the profile directory.
 * @returns the registry base URL without a trailing slash.
 */
function profileRegistry(profileDir) {
  const npmrc = join(profileDir, '.npmrc')
  const configured = existsSync(npmrc)
    ? /^registry=(.+)$/mu.exec(readFileSync(npmrc, 'utf8'))?.[1]?.trim()
    : undefined
  return (configured ?? 'https://registry.npmjs.org/').replace(/\/$/u, '')
}

/**
 * Replace pinned dependencies the registry no longer publishes with a tarball
 * repacked from the host's installed copy. Such a pin makes the profile
 * unreproducible for anyone, including its owner; repacking keeps the exact
 * installed bytes instead of silently moving the user to another version.
 * @param options - `{ profileDir, tarballsDir, hostProfileDir }`.
 * @returns one Chinese sentence per repacked dependency.
 */
export async function repackUnavailableDeps({ profileDir, tarballsDir, hostProfileDir }) {
  const path = join(profileDir, 'package.json')
  const manifest = readJson(path)
  const dependencies = manifest.dependencies ?? {}
  const registry = profileRegistry(profileDir)
  const results = []
  let changed = false
  for (const [name, spec] of Object.entries(dependencies)) {
    if (NON_REGISTRY.test(spec) || !EXACT_VERSION.test(spec)) continue
    const version = spec.trim()
    const response = await fetch(`${registry}/${name.replace('/', '%2F')}`).catch(() => undefined)
    if (response === undefined || !response.ok) continue
    const metadata = await response.json()
    if (metadata?.versions?.[version] !== undefined) continue

    const installed = join(hostProfileDir, 'node_modules', ...name.split('/'))
    if (!existsSync(join(installed, 'package.json'))) {
      results.push(`[警告] ${name}@${version} 已被 registry 下架，且本机没有已安装副本，目标机无法安装`)
      continue
    }
    const file = `${flattenName(name)}-${version}-repacked.tgz`
    repackTarball(installed, join(tarballsDir, file))
    dependencies[name] = `file:${PROFILE_DEPTH}community/plugins/tarballs/${file}`
    changed = true
    results.push(`本机重打包下架依赖 ${name}@${version} → community/plugins/tarballs/${file}`)
  }
  if (changed) writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return results
}
