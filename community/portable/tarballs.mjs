/**
 * Community plugin tarballs: find the newest one for a bundle name, unpack a
 * plugin the host only reached through a development junction, and repack an
 * installed package as an npm-shaped tarball.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { copyTree } from './host.mjs'

/**
 * Flatten a package name the way npm names its tarballs.
 * @param name - package name, with or without a scope.
 * @returns the tarball name prefix.
 */
export function flattenName(name) {
  return name.startsWith('@') ? name.slice(1).replace('/', '-') : name
}

/**
 * Compare two dotted versions, treating a release as newer than a prerelease.
 * @param left - first version string.
 * @param right - second version string.
 * @returns a positive number when `left` is newer.
 */
export function compareVersions(left, right) {
  const [leftCore, leftPre] = left.split('-')
  const [rightCore, rightPre] = right.split('-')
  const leftParts = leftCore.split('.').map(Number)
  const rightParts = rightCore.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  if (leftPre === rightPre) return 0
  if (leftPre === undefined) return 1
  if (rightPre === undefined) return -1
  return leftPre.localeCompare(rightPre)
}

/**
 * Find the newest tarball a bundle name could be supplied by.
 * @param tarballsDir - directory of community plugin tarballs.
 * @param name - bundle package name.
 * @returns the tarball file name, or undefined when none matches.
 */
export function newestTarball(tarballsDir, name) {
  if (!existsSync(tarballsDir)) return undefined
  const prefix = `${flattenName(name)}-`
  const candidates = readdirSync(tarballsDir)
    .filter(file => file.startsWith(prefix) && file.endsWith('.tgz'))
    .map(file => ({ file, version: file.slice(prefix.length, -'.tgz'.length) }))
  if (candidates.length === 0) return undefined
  candidates.sort((left, right) => compareVersions(left.version, right.version))
  return candidates[candidates.length - 1].file
}

/**
 * Unpack the plugins a host only reached through development junctions, so the
 * seed can still resolve them and no target-side install is needed. They land
 * in the shared `profiles/node_modules` fallback, which Node's parent walk from
 * the profile directory reaches and pnpm never prunes.
 * @param options - `{ profileDir, tarballsDir, fallbackDir }`.
 * @returns one Chinese sentence per unpacked plugin.
 */
export function materializeLocalBundles({ profileDir, tarballsDir, fallbackDir }) {
  const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  const dependencies = manifest.dependencies ?? {}
  const results = []
  for (const name of manifest.dsh?.profile?.bundles ?? []) {
    if (dependencies[name] !== undefined) continue
    const tarball = newestTarball(tarballsDir, name)
    if (tarball === undefined) continue
    const target = join(fallbackDir, ...name.split('/'))
    const staging = mkdtempSync(join(tmpdir(), 'dsh-portable-plugin-'))
    const extracted = spawnSync('tar', ['-xzf', join(tarballsDir, tarball), '-C', staging], { stdio: 'inherit' })
    if (extracted.status !== 0) throw new Error(`解包本地插件失败：${tarball}`)
    rmSync(target, { recursive: true, force: true })
    mkdirSync(dirname(target), { recursive: true })
    renameSync(join(staging, 'package'), target)
    rmSync(staging, { recursive: true, force: true })
    results.push(`随包带入本地插件 ${name}（${tarball}）`)
  }
  return results
}

/**
 * Write one npm-shaped tarball from an installed package directory.
 * @param source - the installed package directory.
 * @param destination - the tarball to write.
 */
export function repackTarball(source, destination) {
  const staging = mkdtempSync(join(tmpdir(), 'dsh-portable-repack-'))
  const payload = join(staging, 'package')
  mkdirSync(payload, { recursive: true })
  copyTree(source, payload, () => true)
  mkdirSync(dirname(destination), { recursive: true })
  rmSync(destination, { force: true })
  const tarred = spawnSync('tar', ['-czf', destination, '-C', staging, 'package'], { stdio: 'inherit' })
  rmSync(staging, { recursive: true, force: true })
  if (tarred.status !== 0) throw new Error(`重打包失败：${source}`)
}
