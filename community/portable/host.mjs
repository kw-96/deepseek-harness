/**
 * Host facts and filesystem helpers shared by the portable packer: where the
 * checkout and Harness home are, what the current architecture can produce,
 * and how large each part of the payload is.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, utimesSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arch, homedir, platform } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))

/** Repository root: two levels above `community/portable`. */
export const repoRoot = resolve(here, '..', '..')

/** Harness home this packing host deploys from. */
export const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')

/** Node.js release packed beside the checkout; `dsh.cmd` pins the same version. */
export const BUNDLED_NODE_VERSION = '24.20.0'

/** pnpm version the workspace declares in `packageManager`. */
export const BUNDLED_PNPM_VERSION = '11.7.0'

/** Private or regenerable entries never copied out of a personal home. */
export const HOME_EXCLUDES = [
  'sessions', 'cache', 'storages', 'runtimes', 'marketplace', 'ocr', 'desktop',
  '.credentials.yaml', '.anonymous-user-id', 'node_modules',
]

/** Build residue, VCS metadata, and Rust build trees; `--with-git` keeps the repository. */
export const REPO_EXCLUDES = [
  'node_modules', '.git', '.desktop-build', '.portable-staging', 'target',
  'coverage', '.artifacts', '.data', '.downloads', '.pnpm-store',
  // 部署包不是开发检出：插件源码与它的开发挂载脚本会让 `dsh web` 进入 HMR 模式，
  // 转而用缺开发依赖的 tsc/tsdown 去重建插件；插件一律从 profile 与随包 tarball 加载。
  'community/plugins/packages', 'community/plugins/dev.mjs',
]

/** Architecture this packing host can produce a runnable payload for. */
export function packArch() {
  return process.arch
}

/**
 * Windows architecture suffix used by Node.js release archive names.
 * @param archName - one of `process.arch` values.
 * @returns the archive suffix, or undefined when Node.js publishes no archive.
 */
export function nodeArchiveArch(archName) {
  return archName === 'x64' ? 'x64' : archName === 'arm64' ? 'arm64' : undefined
}

/** Directory name Node.js release archives unpack into. */
export function nodeRuntimeDirName(archName) {
  return `node-v${BUNDLED_NODE_VERSION}-win-${archName}`
}

/**
 * Test whether a path inside a copied tree is excluded.
 * @param rel - the path relative to the copy root, forward slashes.
 * @param excludes - relative paths to drop, matched exactly, by prefix, or by any segment.
 * @returns true when the path must not be copied.
 */
export function excluded(rel, excludes) {
  return excludes.some(entry => rel === entry || rel.startsWith(`${entry}/`) || rel.split('/').includes(entry))
}

/**
 * Sum the apparent size of a directory without following excluded segments.
 * @param dir - absolute directory to measure.
 * @param excludes - path segments that end the walk.
 * @returns the total apparent bytes.
 */
export function apparentSize(dir, excludes = []) {
  if (!existsSync(dir)) return 0
  const result = spawnSync('powershell', ['-NoProfile', '-Command',
    `(Get-ChildItem -LiteralPath '${dir}' -Recurse -Force -File -ErrorAction SilentlyContinue | ` +
    `Where-Object { $_.FullName -notmatch '\\\\(${excludes.join('|')})\\\\' } | ` +
    'Measure-Object -Property Length -Sum).Sum',
  ], { encoding: 'utf8' })
  return Number(result.stdout?.trim()) || 0
}

/**
 * Format a byte count for the Chinese progress output.
 * @param bytes - the size to format.
 * @returns a human-readable size in MB or GB.
 */
export function formatSize(bytes) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

/** Whether this host has everything a portable archive must contain. */
export function checkHost() {
  const required = [
    ['仓库依赖 node_modules', join(repoRoot, 'node_modules')],
    ['前端构建产物 apps/web/dist', join(repoRoot, 'apps', 'web', 'dist', 'index.html')],
    ['CLI 构建产物 apps/cli/lib/bin.js', join(repoRoot, 'apps', 'cli', 'lib', 'bin.js')],
    ['profile 清单', join(dshHome, 'profiles', 'web', 'package.json')],
    ['社区插件 tarball 目录', join(repoRoot, 'community', 'plugins', 'tarballs')],
  ]
  let ready = true
  for (const [label, path] of required) {
    const present = existsSync(path)
    if (!present) ready = false
    console.log(`${present ? '[通过]' : '[缺失]'} ${label}`)
  }
  if (platform() !== 'win32') {
    console.log('[缺失] 便携包只支持在 Windows 上打包')
    ready = false
  }
  if (!ready) console.log('先在这台机器上跑完 pnpm install、pnpm run build，并确认 DSH_HOME 里有 web profile')
  return ready
}

/**
 * Read one JSON file.
 * @param path - absolute file path.
 * @returns the parsed value.
 */
export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Copy a tree, skipping entries that vanish mid-walk (test runners write and
 * delete temporary files next to their sources) and materializing file links
 * instead of carrying them, because Windows junctions store absolute targets
 * that do not survive relocation. Source timestamps are preserved so the
 * desktop shell's freshness checks see the same relations after extraction.
 * @param from - absolute source directory.
 * @param to - absolute destination directory.
 * @param filter - receives each absolute source path; returns false to skip it.
 */
export function copyTree(from, to, filter) {
  mkdirSync(to, { recursive: true })
  let entries
  try {
    entries = readdirSync(from, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    if (!filter(source)) continue
    let stat
    try {
      stat = lstatSync(source)
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    let resolved = stat
    if (stat.isSymbolicLink()) {
      try {
        resolved = statSync(source)
      } catch (error) {
        if (error.code === 'ENOENT') continue
        throw error
      }
      if (resolved.isDirectory()) continue
    }
    if (resolved.isDirectory()) {
      copyTree(source, target, filter)
      continue
    }
    try {
      copyFileSync(source, target)
      utimesSync(target, resolved.atime, resolved.mtime)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
}

/**
 * Modification time in milliseconds, or 0 when the path is absent.
 * @param path - absolute file path.
 * @returns epoch milliseconds.
 */
export function mtimeMs(path) {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}
