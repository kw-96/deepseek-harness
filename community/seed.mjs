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
 * - profile: writes $DSH_HOME/profiles/web when it is absent; otherwise repairs
 *            only what drifted — tarball paths left by another checkout, and
 *            bundles this host cannot install — leaving bundles the user added
 *            beyond the template untouched. Pass --force to rewrite the whole
 *            profile from the template instead.
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
import { GITHUB_BUNDLES, probe } from './preflight.mjs'
import {
  droppedBundles, materializeProfile, renderProfile, repairProfile, unavailablePinned,
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
 * Read the profile manifest when it exists.
 * @returns the parsed manifest, or undefined before the first seed.
 */
async function readProfileManifest() {
  if (!existsSync(profileManifest)) return undefined
  return JSON.parse(await readFile(profileManifest, 'utf8'))
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
  const bundles = existing.dsh.profile.bundles ?? []
  const githubReachable = GITHUB_BUNDLES.some(name => bundles.includes(name))
    ? await probe('https://github.com')
    : true
  const changes = repairProfile(existing, {
    tarballsUrl,
    dropped: droppedBundles({
      internal: npmrc.includes('nie.netease.com'),
      githubReachable,
      platform: platform(),
      arch: arch(),
    }),
  })
  if (changes.length > 0) {
    for (const change of changes) console.log(`[community] ${change}`)
    await writeFile(profileManifest, renderProfile(existing), 'utf8')
    installProfile()
  }
}
