#!/usr/bin/env node
/**
 * Idempotently seed this host's DeepSeek Harness deployment from the
 * repository's community/ assets, so that
 *
 *   pnpm install && pnpm run build && pnpm dsh web
 *
 * is fully self-contained on a fresh machine.
 *
 * - skills:  copies any missing skill into $DSH_HOME/skills (never overwrites)
 * - home:    copies any missing global home file into $DSH_HOME (never overwrites)
 * - presets: converges a shipped preset on the repository copy when the file
 *            still matches what an earlier seed wrote (tracked by a content
 *            ledger beside the presets); a preset the user edited is kept
 *            untouched, and the first update over a pre-ledger install leaves a
 *            `.bak` beside the replaced file
 * - profile: writes $DSH_HOME/profiles/web when it is absent; otherwise converges
 *            it on the template — tarball paths left by another checkout, bundles
 *            this host cannot install, bundles the template retired
 *            (profiles/web/retired.json), and template bundles, dependencies,
 *            `allowBuilds` and `minimumReleaseAgeExclude` entries this profile is
 *            missing — while leaving bundles the user added beyond the template
 *            untouched. Pass --force to rewrite the whole profile from the
 *            template instead.
 *
 * A bundle the local network or the CPU architecture cannot support is dropped
 * with a printed reason, so a seeded profile always installs.
 * `node community/doctor.mjs` reports the same checks without changing anything.
 *
 * Env overrides: DSH_SEED_SKIP_INSTALL=1 to never run pnpm in the profile.
 * Flags: --force (re-write the profile manifest).
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, arch, platform } from 'node:os'
import { spawnSync } from 'node:child_process'
import { probe } from './preflight.mjs'
import {
  absorbManagedBlock, bundleAnchors, droppedBundles, materializeProfile, mergeAllowBuilds, mergeMappingEntries,
  mergeReleaseAgeExcludes, renderProfile, repairProfile, retireHoistPatterns, retirePatchRows, unavailablePinned,
  unresolvableBundles,
} from './profile.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const tarballsUrl = join(repoRoot, 'community', 'plugins', 'tarballs').replaceAll('\\', '/')

/** Public npm registry every profile installs from. */
const PUBLIC_REGISTRY = 'https://registry.npmjs.org/'

const profileSrc = join(here, 'profiles', 'web')
const profileDst = join(dshHome, 'profiles', 'web')
const profileManifest = join(profileDst, 'package.json')
const skillsSrc = join(here, 'skills')
const skillsDst = join(dshHome, 'skills')
const homeSrc = join(here, 'home')

/**
 * Run `pnpm install` inside the profile directory.
 * @returns true when the profile either installed or was told to skip.
 */
function installProfile() {
  if (process.env.DSH_SEED_SKIP_INSTALL === '1') return true
  const result = spawnSync('pnpm install --no-frozen-lockfile', {
    cwd: profileDst,
    stdio: 'inherit',
    shell: true,
  })
  if (result.status === 0) return true
  console.warn('[community] profile 依赖安装失败，请在 profile 目录里手动执行 pnpm install')
  return false
}

/**
 * Print one line per bundle this host cannot install.
 * @param dropped - dropped bundle name to Chinese reason.
 */
function reportDropped(dropped) {
  for (const [name, reason] of dropped) console.log(`[community] 跳过插件 ${name}：${reason}`)
}

/**
 * Extend a drop set with the bundles nothing on this host can supply — rows
 * `dsh-plugin-manager` wrote from its catalog without a dependency to install.
 * A name the template does declare a dependency for is left alone: the
 * convergence step installs it from that dependency instead.
 * @param dropped - the drop set to extend in place.
 * @param pkg - the manifest about to be written or repaired.
 * @param template - the parsed checked-in profile template.
 */
function dropUnresolvable(dropped, pkg, template) {
  const anchors = bundleAnchors({ repoRoot, profileDir: profileDst, dshHome })
  const provided = new Set(Object.keys(template?.dependencies ?? {}))
  for (const [name, reason] of unresolvableBundles(pkg, anchors)) {
    if (provided.has(name)) continue
    if (!dropped.has(name)) dropped.set(name, reason)
  }
}

/**
 * Read the profile manifest when it exists.
 * @returns the parsed manifest, or undefined before the first seed.
 */
async function readProfileManifest() {
  if (!existsSync(profileManifest)) return undefined
  return JSON.parse(await readFile(profileManifest, 'utf8'))
}

/**
 * Copy the template's pnpm patch files into the profile. A patch file this
 * profile already carries an identical copy of is left alone, and a patch file
 * only the host has (a `pnpm patch` the user made) is never deleted.
 * @returns one Chinese sentence when a file was written.
 */
async function convergePatchFiles() {
  const src = join(profileSrc, 'patches')
  if (!existsSync(src)) return undefined
  const dst = join(profileDst, 'patches')
  await mkdir(dst, { recursive: true })
  let copied = 0
  for (const name of await readdir(src)) {
    const from = join(src, name)
    const to = join(dst, name)
    if (existsSync(to) && await readFile(to, 'utf8') === await readFile(from, 'utf8')) continue
    await cp(from, to, { force: true })
    copied += 1
  }
  return copied > 0 ? `更新 profile 依赖补丁 ${copied} 个` : undefined
}

/**
 * Converge the profile's hand-editable configuration on the template: copy the
 * `allowBuilds` entries the profile is missing, fold a plugin's trailing
 * block-style patch rows back into the array, and drop patch rows a retired
 * bundle left behind. Both files carry user edits, so they are merged in place
 * instead of being rewritten from the template.
 * @param retired - retired package names.
 * @returns one Chinese sentence per applied change.
 */
async function convergeProfileFiles(retired) {
  const changes = []
  const workspacePath = join(profileDst, 'pnpm-workspace.yaml')
  if (existsSync(workspacePath)) {
    const templateWorkspace = await readFile(join(profileSrc, 'pnpm-workspace.yaml'), 'utf8')
    const merged = mergeAllowBuilds(await readFile(workspacePath, 'utf8'), templateWorkspace)
    if (merged !== undefined) {
      await writeFile(workspacePath, merged, 'utf8')
      changes.push('合并模板新增的构建白名单 allowBuilds')
    }
    const patched = mergeMappingEntries(
      await readFile(workspacePath, 'utf8'),
      templateWorkspace,
      'patchedDependencies',
    )
    if (patched !== undefined) {
      await writeFile(workspacePath, patched, 'utf8')
      changes.push('合并模板新增的依赖补丁 patchedDependencies')
    }
    const released = mergeReleaseAgeExcludes(await readFile(workspacePath, 'utf8'), templateWorkspace)
    if (released !== undefined) {
      await writeFile(workspacePath, released, 'utf8')
      changes.push('合并模板新增的版本等待期豁免 minimumReleaseAgeExclude')
    }
    const hoist = retireHoistPatterns(await readFile(workspacePath, 'utf8'), retired)
    if (hoist.removed.length > 0) {
      await writeFile(workspacePath, hoist.text, 'utf8')
      changes.push(`移除已下线包的 hoist 规则：${[...new Set(hoist.removed)].join('、')}`)
    }
    const patchFiles = await convergePatchFiles()
    if (patchFiles !== undefined) changes.push(patchFiles)
  }
  const patchPath = join(profileDst, 'cordis.patch.yml')
  if (existsSync(patchPath)) {
    const original = await readFile(patchPath, 'utf8')
    const absorbed = absorbManagedBlock(original)
    if (absorbed.absorbed > 0) changes.push(`把插件写在数组之后的托管行并回补丁数组：${absorbed.absorbed} 行`)
    const result = retirePatchRows(absorbed.text, retired)
    if (result.removed.length > 0) changes.push(`移除已下线插件的补丁行：${[...new Set(result.removed)].join('、')}`)
    if (result.text !== original) await writeFile(patchPath, result.text, 'utf8')
    for (const name of retired) {
      if (result.text.includes(name)) {
        console.warn(`[community] 请手动移除 ${patchPath} 中 ${name} 的补丁行（不是单行格式，无法自动识别）`)
      }
    }
  }
  return changes
}

// Skills: fill in any that are missing; never overwrite an existing skill.
await mkdir(skillsDst, { recursive: true })
for (const name of await readdir(skillsSrc)) {
  if (existsSync(join(skillsDst, name))) continue
  await cp(join(skillsSrc, name), join(skillsDst, name), { recursive: true })
  console.log(`[community] 安装 skill → ${name}`)
}

// Global home files (e.g. the user-global AGENTS.md): fill in any that are
// missing; never overwrite a file the user already has at $DSH_HOME.
if (existsSync(homeSrc)) {
  for (const name of await readdir(homeSrc)) {
    if (existsSync(join(dshHome, name))) continue
    await cp(join(homeSrc, name), join(dshHome, name))
    console.log(`[community] 安装全局文件 → ${name}`)
  }
}

// Agent presets: converge a shipped preset on the repository copy when the
// installed file still matches what an earlier seed wrote. A ledger beside the
// presets records each seeded file's content hash, so an upgrade replaces only
// files this repository owns: a preset the user edited keeps its content, and
// an install predating the ledger keeps its replaced file as `.bak`.
const presetsSrc = join(here, 'presets')
const presetsDst = join(dshHome, '.agent-presets')
const presetLedger = join(presetsDst, '.seeded.json')
const digest = value => createHash('sha256').update(value).digest('hex')
if (existsSync(presetsSrc)) {
  let ledger = {}
  if (existsSync(presetLedger)) {
    try {
      ledger = JSON.parse(await readFile(presetLedger, 'utf8'))
    } catch {
      // A damaged ledger means every installed preset reads as user-owned
      // below, which keeps files in place instead of guessing.
      ledger = {}
    }
  }
  let ledgerChanged = false
  const remember = (key, hash) => {
    if (ledger[key] === hash) return
    ledger[key] = hash
    ledgerChanged = true
  }
  for (const id of await readdir(presetsSrc)) {
    for (const name of await readdir(join(presetsSrc, id))) {
      const key = `${id}/${name}`
      const from = join(presetsSrc, id, name)
      const dest = join(presetsDst, id, name)
      const sourceHash = digest(await readFile(from))
      if (!existsSync(dest)) {
        await mkdir(dirname(dest), { recursive: true })
        await cp(from, dest)
        console.log(`[community] 安装预设 → ${key}`)
        remember(key, sourceHash)
        continue
      }
      const installedHash = digest(await readFile(dest))
      if (installedHash === sourceHash) {
        remember(key, sourceHash)
        continue
      }
      const recorded = ledger[key]
      if (recorded !== undefined && recorded !== installedHash) {
        console.log(`[community] 保留本地改过的预设 → ${key}`)
        continue
      }
      if (recorded === undefined) {
        // An install from before the ledger cannot prove ownership; keep the
        // replaced file beside it so nothing is lost either way.
        await cp(dest, `${dest}.bak`)
        console.log(`[community] 旧预设已备份为 ${key}.bak`)
      }
      await cp(from, dest, { force: true })
      console.log(`[community] 更新预设 → ${key}`)
      remember(key, sourceHash)
    }
  }
  if (ledgerChanged) {
    await mkdir(presetsDst, { recursive: true })
    await writeFile(presetLedger, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
  }
}

const existing = await readProfileManifest()
const force = process.argv.includes('--force')

if (existing === undefined || force) {
  // Fresh seed. The registry is written once here and into .npmrc; a repair
  // converges whatever the profile already points at.
  const registry = PUBLIC_REGISTRY
  const template = JSON.parse(await readFile(join(profileSrc, 'package.json'), 'utf8'))
  const dropped = droppedBundles({
    githubReachable: await probe('https://github.com'),
    platform: platform(),
    arch: arch(),
  })
  // A pinned package the registry no longer serves would fail the install, so
  // it is dropped here with the reason instead.
  for (const [name, reason] of await unavailablePinned(template, registry, dropped)) dropped.set(name, reason)
  dropUnresolvable(dropped, template, template)
  reportDropped(dropped)

  await mkdir(profileDst, { recursive: true })
  for (const file of ['cordis.yml', 'cordis.patch.yml', 'pnpm-workspace.yaml']) {
    await cp(join(profileSrc, file), join(profileDst, file), { force: true })
  }
  await convergePatchFiles()
  await writeFile(profileManifest, renderProfile(materializeProfile(template, { tarballsUrl, dropped })), 'utf8')
  await writeFile(join(profileDst, '.npmrc'), `registry=${registry}\n`, 'utf8')
  console.log(`[community] profile → ${profileDst}（registry ${registry}）`)
  installProfile()
} else {
  // Repair. Only the two facts that go stale are recomputed: where this
  // checkout's tarballs live, and which bundles this host can install. The
  // GitHub probe runs only while a GitHub-only bundle is still declared, so a
  // clean boot stays offline.
  // Repair never probes the network. A bundle that is already installed keeps
  // working offline, and a probe that wrongly reports "unreachable" would
  // delete it; only a fresh seed weighs the network, before anything exists.
  const dropped = droppedBundles({
    githubReachable: true,
    platform: platform(),
    arch: arch(),
  })
  const template = JSON.parse(await readFile(join(profileSrc, 'package.json'), 'utf8'))
  const retired = JSON.parse(await readFile(join(profileSrc, 'retired.json'), 'utf8'))
  dropUnresolvable(dropped, existing, template)
  const manifestChanges = repairProfile(existing, { tarballsUrl, dropped, template, retired })
  const changes = [...manifestChanges, ...await convergeProfileFiles(retired)]
  for (const change of changes) console.log(`[community] ${change}`)
  // 清单变了，或这个 profile 从未装过依赖（新主机只带清单、node_modules 被删、
  // 上次安装中断），才安装。补丁层自愈是每次启动都会发生的机械修复——社区插件
  // 每次启动都重写自己的托管块——让它在启动时触发一次 pnpm install 既慢又没有
  // 任何依赖变化可装。
  const installedModules = join(profileDst, 'node_modules', '.modules.yaml')
  if (manifestChanges.length > 0) {
    await writeFile(profileManifest, renderProfile(existing), 'utf8')
    installProfile()
  } else if (!existsSync(installedModules)) {
    console.log('[community] profile 尚未安装依赖，执行安装')
    installProfile()
  }
}
