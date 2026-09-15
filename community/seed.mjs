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
 * - profile: writes $DSH_HOME/profiles/web when it is absent; otherwise converges
 *            it on the template — tarball paths left by another checkout, bundles
 *            this host cannot install, bundles the template retired
 *            (profiles/web/retired.json), and template bundles, dependencies and
 *            `allowBuilds` entries this profile is missing — while leaving
 *            bundles the user added beyond the template untouched. Pass --force
 *            to rewrite the whole profile from the template instead.
 *
 * A bundle the chosen registry, the local network, or the CPU architecture
 * cannot support is dropped with a printed reason, so a seeded profile always
 * installs. `node community/doctor.mjs` reports the same checks without
 * changing anything.
 *
 * Env overrides: DSH_SEED_SKIP_INSTALL=1 to never run pnpm in the profile.
 * Flags: --force (re-write the profile manifest), --internal / --public.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, arch, platform } from 'node:os'
import { spawnSync } from 'node:child_process'
import { probe } from './preflight.mjs'
import {
  absorbManagedBlock, bundleAnchors, droppedBundles, materializeProfile, mergeAllowBuilds, renderProfile, repairProfile,
  retirePatchRows, unavailablePinned, unresolvableBundles,
} from './profile.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const tarballsUrl = join(repoRoot, 'community', 'plugins', 'tarballs').replaceAll('\\', '/')

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
    const merged = mergeAllowBuilds(
      await readFile(workspacePath, 'utf8'),
      await readFile(join(profileSrc, 'pnpm-workspace.yaml'), 'utf8'),
    )
    if (merged !== undefined) {
      await writeFile(workspacePath, merged, 'utf8')
      changes.push('合并模板新增的构建白名单 allowBuilds')
    }
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

const existing = await readProfileManifest()
const force = process.argv.includes('--force')

if (existing === undefined || force) {
  // Fresh seed. The registry is chosen once here and written into .npmrc; a
  // repair keeps whatever the profile already points at.
  const internal = process.argv.includes('--internal')
    ? true
    : process.argv.includes('--public')
      ? false
      : await probe('https://npm.nie.netease.com/')
  const registry = internal ? 'https://npm.nie.netease.com/' : 'https://registry.npmjs.org/'
  const template = JSON.parse(await readFile(join(profileSrc, 'package.json'), 'utf8'))
  const dropped = droppedBundles({
    internal,
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
  await writeFile(profileManifest, renderProfile(materializeProfile(template, { tarballsUrl, dropped })), 'utf8')
  await writeFile(join(profileDst, '.npmrc'), `registry=${registry}\n`, 'utf8')
  console.log(`[community] profile → ${profileDst}（${internal ? '网易内网' : '公网'}）`)
  installProfile()
} else {
  // Repair. Only the two facts that go stale are recomputed: where this
  // checkout's tarballs live, and which bundles this host can install. The
  // GitHub probe runs only while a GitHub-only bundle is still declared, so a
  // clean boot stays offline.
  const npmrc = existsSync(join(profileDst, '.npmrc'))
    ? await readFile(join(profileDst, '.npmrc'), 'utf8')
    : ''
  // Repair never probes the network. A bundle that is already installed keeps
  // working offline, and a probe that wrongly reports "unreachable" would
  // delete it; only a fresh seed weighs the network, before anything exists.
  const dropped = droppedBundles({
    internal: npmrc.includes('nie.netease.com'),
    githubReachable: true,
    platform: platform(),
    arch: arch(),
  })
  const template = JSON.parse(await readFile(join(profileSrc, 'package.json'), 'utf8'))
  const retired = JSON.parse(await readFile(join(profileSrc, 'retired.json'), 'utf8'))
  dropUnresolvable(dropped, existing, template)
  const changes = repairProfile(existing, { tarballsUrl, dropped, template, retired })
  changes.push(...await convergeProfileFiles(retired))
  if (changes.length > 0) {
    for (const change of changes) console.log(`[community] ${change}`)
    await writeFile(profileManifest, renderProfile(existing), 'utf8')
    installProfile()
  }
}
