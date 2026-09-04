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
 * - profile: writes $DSH_HOME/profiles/web (bundles + deps + registry) only
 *            when it does not exist, then runs `pnpm install` there once
 * - network: probes the NetEase registry and skips the two internal packages
 *            when it is unreachable
 *
 * Env overrides: DSH_SEED_SKIP_INSTALL=1 to never run pnpm in the profile.
 * Flags: --force (re-write the profile manifest), --internal / --public.
 */
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const tarballs = join(repoRoot, 'community', 'plugins', 'tarballs')
const tarballsUrl = tarballs.replace(/\\/g, '/')

const profileSrc = join(here, 'profiles', 'web')
const profileDst = join(dshHome, 'profiles', 'web')
const skillsSrc = join(here, 'skills')
const skillsDst = join(dshHome, 'skills')

/** Packages that exist only on the NetEase-internal npm registry. */
const INTERNAL_PACKAGES = ['ntes-dsh-market', '@dap-dsh-plugins/netease-auth']

async function detectInternalNetwork() {
  try {
    await fetch('https://npm.nie.netease.com/', { signal: AbortSignal.timeout(4000) })
    return true
  } catch {
    return false
  }
}

const internal = process.argv.includes('--internal')
  ? true
  : process.argv.includes('--public')
    ? false
    : await detectInternalNetwork()

// Skills: fill in any that are missing; never overwrite an existing skill.
await mkdir(skillsDst, { recursive: true })
for (const name of await readdir(skillsSrc)) {
  if (existsSync(join(skillsDst, name))) continue
  await cp(join(skillsSrc, name), join(skillsDst, name), { recursive: true })
  console.log(`[community] skill → ${name}`)
}

// Global home files (e.g. the user-global AGENTS.md): fill in any that are
// missing; never overwrite a file the user already has at $DSH_HOME.
const homeSrc = join(here, 'home')
if (existsSync(homeSrc)) {
  for (const name of await readdir(homeSrc)) {
    if (existsSync(join(dshHome, name))) continue
    await cp(join(homeSrc, name), join(dshHome, name))
    console.log(`[community] home → ${name}`)
  }
}

// Profile: seed once; leave an existing profile alone unless --force.
const profileExists = existsSync(join(profileDst, 'package.json'))
if (profileExists && !process.argv.includes('--force')) {
  process.exit(0)
}

await mkdir(profileDst, { recursive: true })
for (const file of ['cordis.yml', 'cordis.patch.yml', 'pnpm-workspace.yaml']) {
  await cp(join(profileSrc, file), join(profileDst, file), { force: true })
}

const pkg = JSON.parse(await readFile(join(profileSrc, 'package.json'), 'utf8'))
if (!internal) {
  pkg.dsh.profile.bundles = pkg.dsh.profile.bundles.filter(name => !INTERNAL_PACKAGES.includes(name))
  for (const name of INTERNAL_PACKAGES) delete pkg.dependencies[name]
}
const packageJson = JSON.stringify(pkg, null, 2).replaceAll('__COMMUNITY_TARBALLS__', tarballsUrl)
await writeFile(join(profileDst, 'package.json'), packageJson, 'utf8')

const npmrc = internal
  ? 'registry=https://npm.nie.netease.com/\n'
  : 'registry=https://registry.npmjs.org/\n'
await writeFile(join(profileDst, '.npmrc'), npmrc, 'utf8')

console.log(`[community] profile → ${profileDst} (${internal ? 'NetEase-internal' : 'public'})`)
if (!internal) console.log(`[community] skipped → ${INTERNAL_PACKAGES.join(', ')}`)

if (process.env.DSH_SEED_SKIP_INSTALL !== '1') {
  const result = spawnSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: profileDst, stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    console.warn('[community] profile pnpm install failed; run it manually in the profile dir')
  }
}
