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
import yaml from 'js-yaml'
import { GITHUB_BUNDLES, NATIVE_BUNDLE_LIMITS, tarballAvailable } from './preflight.mjs'

/** Placeholder seed substitutes with this checkout's tarballs directory. */
export const TARBALLS_TOKEN = '__COMMUNITY_TARBALLS__'

/** remote-web-ui 的 lan-bind 托管块标记：插件把它写在顶层数组之后。 */
const MANAGED_BLOCK_BEGIN = '# --- remote-web-ui lan-bind block (managed - do not edit) ---'

/** 同一托管块的结束标记。 */
const MANAGED_BLOCK_END = '# --- end remote-web-ui lan-bind block ---'

/** Path fragment identifying a dependency pinned to a community tarball. */
const TARBALLS_MARKER = '/community/plugins/tarballs/'

/** Dependency specifiers that never resolve through an npm registry. */
const NON_REGISTRY = ['file:', 'github:', 'link:', 'workspace:', 'portal:', 'http:', 'https:']

/** Exact versions only: a range has no single tarball to probe. */
const EXACT_VERSION = /^\d+\.\d+\.\d+/

/**
 * Template bundles this host must not receive, each with the reason shown to
 * the user.
 * @param host - `{ githubReachable, platform, arch }` probe results.
 * @returns dropped bundle name to Chinese reason.
 */
export function droppedBundles(host) {
  const dropped = new Map()
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
    changes.push(`下线 ${name}（不再随模板提供）`)
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
 * Copy the template mapping entries this profile is missing, leaving the
 * profile's own entries and their order untouched. Comment lines directly above
 * a copied entry travel with it; existing entries are never overwritten.
 * @param profileText - the profile's current pnpm-workspace.yaml text.
 * @param templateText - the template's pnpm-workspace.yaml text.
 * @param key - the top-level mapping key to converge.
 * @returns the merged text, or undefined when nothing is missing.
 */
export function mergeMappingEntries(profileText, templateText, key) {
  return mergeBlockEntries(profileText, templateText, key, mappingBlock)
}

/**
 * Copy the template's `minimumReleaseAgeExclude` entries this profile is
 * missing. The key holds a block sequence rather than a mapping, so entries are
 * matched by their scalar text.
 * @param profileText - the profile's pnpm-workspace.yaml text.
 * @param templateText - the template's pnpm-workspace.yaml text.
 * @returns the merged text, or undefined when nothing is missing.
 */
export function mergeReleaseAgeExcludes(profileText, templateText) {
  return mergeBlockEntries(profileText, templateText, 'minimumReleaseAgeExclude', sequenceBlock)
}

/**
 * Copy the template entries one top-level block is missing, leaving the
 * profile's own entries and their order untouched. Comment lines directly above
 * a copied entry travel with it; existing entries are never overwritten. A
 * profile without the block gains it at the end of the file.
 * @param profileText - the profile's pnpm-workspace.yaml text.
 * @param templateText - the template's pnpm-workspace.yaml text.
 * @param key - the top-level key to converge.
 * @param locate - reader for this key's entry form.
 * @returns the merged text, or undefined when nothing is missing.
 */
function mergeBlockEntries(profileText, templateText, key, locate) {
  const templateBlock = locate(templateText, key)
  if (templateBlock === undefined) return undefined
  const present = new Set((locate(profileText, key)?.entries ?? []).map(entry => entry.key))
  const missing = templateBlock.entries.filter(entry => !present.has(entry.key))
  if (missing.length === 0) return undefined
  const lines = profileText.split(/\r?\n/)
  const block = locate(profileText, key)
  if (block === undefined) {
    const appended = [...lines, `${key}:`, ...missing.flatMap(entry => entry.lines)]
    return `${appended.join('\n').replace(/\n*$/u, '')}\n`
  }
  const merged = [...lines.slice(0, block.end), ...missing.flatMap(entry => entry.lines), ...lines.slice(block.end)]
  return merged.join('\n')
}

/**
 * Copy the template's build allowlist entries this profile is missing.
 * @param profileText - the profile's pnpm-workspace.yaml text.
 * @param templateText - the template's pnpm-workspace.yaml text.
 * @returns the merged text, or undefined when nothing is missing.
 */
export function mergeAllowBuilds(profileText, templateText) {
  return mergeMappingEntries(profileText, templateText, 'allowBuilds')
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
 * Remove retired package names from the workspace's inline
 * `publicHoistPattern`. A profile hoists packages the bundle patches bind
 * outside the template's dependency tree; when such a package is retired it
 * must stop being hoisted with it. Only the inline `publicHoistPattern: 'a'`
 * form is rewritten; a block sequence is left for the user to edit.
 * @param text - `pnpm-workspace.yaml` text.
 * @param retired - retired package names.
 * @returns the repaired text and the names actually removed.
 */
export function retireHoistPatterns(text, retired) {
  const removed = []
  const lines = text.split(/\r?\n/).flatMap((line) => {
    const match = /^(publicHoistPattern:\s*)(.+)$/u.exec(line)
    if (match === null) return [line]
    const tokens = match[2].match(/['"]?[^'"\s]+['"]?/gu) ?? []
    const kept = tokens.filter((token) => {
      const name = token.replace(/^['"]|['"]$/gu, '')
      if (!retired.includes(name)) return true
      removed.push(name)
      return false
    })
    return kept.length === 0 ? [] : [`${match[1]}${kept.join(' ')}`]
  })
  return { text: lines.join('\n'), removed }
}

/**
 * Advance past a quoted YAML scalar starting at its opening quote, honouring
 * the double-quote backslash escape and the single-quote doubled-quote escape.
 * @param text - the patch file text.
 * @param start - index of the opening quote.
 * @returns the index of the closing quote, or -1 when the scalar is unterminated.
 */
function skipQuotedScalar(text, start) {
  const quote = text[start]
  let index = start + 1
  while (index < text.length) {
    const char = text[index]
    if (quote === '"' && char === '\\') {
      index += 2
      continue
    }
    if (char === quote) {
      if (quote === "'" && text[index + 1] === "'") {
        index += 2
        continue
      }
      return index
    }
    index += 1
  }
  return -1
}

/**
 * Locate the closing bracket of a patch file's top-level flow array. The scan
 * skips comments and quoted scalars, so a nested array inside an earlier row
 * (HMR's own `root: [ … ]`, for example) is never mistaken for the top-level
 * close the way `lastIndexOf(']')` mistakes it.
 * @param text - the patch file text.
 * @returns the index of the top-level `]`, or -1 when the root is a block sequence.
 */
export function findRootArrayClose(text) {
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === '#' && (index === 0 || /\s/u.test(text[index - 1]))) {
      const lineEnd = text.indexOf('\n', index)
      if (lineEnd === -1) return -1
      index = lineEnd
      continue
    }
    if (/\s/u.test(char)) {
      index += 1
      continue
    }
    break
  }
  if (text[index] !== '[') return -1
  let depth = 0
  for (; index < text.length; index += 1) {
    const char = text[index]
    if (char === '#' && (index === 0 || /\s/u.test(text[index - 1]))) {
      const lineEnd = text.indexOf('\n', index)
      if (lineEnd === -1) return -1
      index = lineEnd
      continue
    }
    if (char === '"' || char === "'") {
      const close = skipQuotedScalar(text, index)
      if (close === -1) return -1
      index = close
      continue
    }
    if (char === '[') {
      depth += 1
    } else if (char === ']') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/**
 * Fold a plugin's trailing block-style patch rows back into the profile patch
 * array. The retired `remote-web-ui` wrote its LAN-bind block sequence after the
 * file's flow array, which leaves the document invalid YAML and costs the
 * profile its entire user patch layer at the next boot. The plugin is gone, but
 * a profile it once ran on still carries that block, so the repair stays. The
 * rows are re-emitted as single-line flow rows inside the array — replacing an
 * existing row with the same id, so re-absorbing a rewritten block never leaves
 * two rows competing — and the same cleanup rules (`retirePatchRows`) still
 * recognise them.
 * @param text - the profile's cordis.patch.yml text.
 * @returns the repaired text and the number of absorbed rows.
 */
export function absorbManagedBlock(text) {
  const begin = text.indexOf(MANAGED_BLOCK_BEGIN)
  if (begin === -1) return { text, absorbed: 0 }
  // 文件本身已合法时不做并回：块尾仅在根是 flow 数组时才非法，根为 block
  // 序列（把根改成 block 风格后）的块尾是合法 YAML。
  try {
    yaml.load(text)
    return { text, absorbed: 0 }
  } catch {
    // 这里吞掉的是 js-yaml 对「flow 数组 + 块尾」的解析错误；该形态正是下面要修的目标。
  }
  const endMarkerAt = text.indexOf(MANAGED_BLOCK_END, begin)
  const blockEnd = endMarkerAt === -1 ? text.length : endMarkerAt + MANAGED_BLOCK_END.length
  const blockBody = text.slice(text.indexOf('\n', begin) + 1, endMarkerAt === -1 ? text.length : endMarkerAt)
  let parsed
  try {
    parsed = yaml.load(blockBody) ?? []
  } catch {
    // 块本身不可解析时不猜内容，原样保留交给用户处理。
    return { text, absorbed: 0 }
  }
  const entries = (Array.isArray(parsed) ? parsed : [])
    .filter(row => row !== null && typeof row === 'object' && !Array.isArray(row))
  if (entries.length === 0) return { text, absorbed: 0 }
  const taken = entries.map(row => row.id).filter(id => typeof id === 'string')
  // 同名行在被吸收的那次里可能出现两份（插件每次启动都会重写托管块），
  // 先按 id 去掉数组里已有的行，避免留下互相竞争的两行。
  const head = text.slice(0, begin).replace(/\s+$/u, '')
    .split(/\r?\n/)
    .filter(line => !taken.some(id => isFlowRowForId(line, id)))
    .join('\n')
    .replace(/\s+$/u, '')
  const close = findRootArrayClose(head)
  if (close === -1) return { text, absorbed: 0 }
  const rows = entries.map(row => JSON.stringify(row))
  const body = head.slice(0, close).replace(/\s+$/u, '')
  const separator = body.endsWith('[') || body.endsWith(',') ? '' : ','
  const tail = text.slice(blockEnd).replace(/^\s+/u, '')
  const merged = `${body}${separator}\n${rows.map(row => `  ${row}`).join(',\n')}\n${head.slice(close)}`
  return { text: tail === '' ? `${merged}\n` : `${merged}\n${tail}`, absorbed: rows.length }
}

/**
 * Whether one line is a complete single-line patch row carrying the given id.
 * @param line - one line of a patch file.
 * @param id - the row id to match.
 * @returns true when the line is that id's flow-style row.
 */
function isFlowRowForId(line, id) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{') || !trimmed.includes('}')) return false
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`['"]?id['"]?\\s*:\\s*['"]?${escaped}['"]?\\s*[,}]`, 'u').test(trimmed)
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
  return new RegExp(`['"]?name['"]?\\s*:\\s*['"]?${escaped}['"]?\\s*[,}]`, 'u').test(trimmed)
}

/**
 * Locate a top-level mapping block and read its entries.
 * @param text - pnpm-workspace.yaml text.
 * @param key - the top-level key to locate (`allowBuilds`, `patchedDependencies`).
 * @returns the block's end index and entries, or undefined without the block.
 */
function mappingBlock(text, key) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => line.trim() === `${key}:`)
  if (start === -1) return undefined
  const end = blockEnd(lines, start)
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
 * Locate a top-level block sequence and read its entries.
 * @param text - pnpm-workspace.yaml text.
 * @param key - the top-level key to locate (`minimumReleaseAgeExclude`).
 * @returns the block's end index and entries, or undefined without the block.
 */
function sequenceBlock(text, key) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => line.trim() === `${key}:`)
  if (start === -1) return undefined
  const end = blockEnd(lines, start)
  const entries = []
  for (let index = start + 1; index < end; index += 1) {
    const match = /^\s*-\s*(.+?)\s*$/u.exec(lines[index])
    if (match === null) continue
    const previous = lines[index - 1]
    const lines0 = previous !== undefined && /^\s*#/u.test(previous) && index - 1 > start
      ? [previous, lines[index]]
      : [lines[index]]
    entries.push({ key: match[1].replace(/^['"]|['"]$/gu, ''), lines: lines0 })
  }
  return { start, end, entries }
}

/**
 * Find the last line of a top-level block: its entries stop at the first line
 * that is neither blank nor indented.
 * @param lines - the file's lines.
 * @param start - the key line's index.
 * @returns the index after the block's last line.
 */
function blockEnd(lines, start) {
  let end = start + 1
  while (end < lines.length && (lines[end].trim() === '' || /^\s/u.test(lines[end]))) end += 1
  return end
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
