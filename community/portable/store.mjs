/**
 * Materialize the offline pnpm store the portable package installs from.
 *
 * A target host must install twice — the checkout's production dependency
 * graph, and the Harness web profile's plugins — and neither may touch the
 * network or a system package manager. Both installs therefore run here, on the
 * packing host, against a store directory that travels inside the archive;
 * every `node_modules` they produce is deleted again because pnpm records
 * Windows junctions as absolute paths, which do not survive relocation.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { delimiter, dirname, join, resolve } from 'node:path'

/** Store directory every install of this package uses, relative to its root. */
export const STORE_DIR_NAME = '.pnpm-store'

/** pnpm build state produced while packing; never shipped. */
const STATE_DIR_NAME = '.pnpm-state'

/**
 * Absolute store directory inside the staged package.
 * @param stage - the staged package directory.
 * @returns the absolute store path.
 */
export function storeDir(stage) {
  return join(resolve(stage), STORE_DIR_NAME)
}

/**
 * Run pnpm through the bundled Node.js with an isolated configuration.
 * @param options - `{ stage, nodeExe, pnpmEntry, cwd, args, label }`.
 */
function runPnpm({ stage, nodeExe, pnpmEntry, cwd, args, label }) {
  const state = join(resolve(stage), STATE_DIR_NAME)
  const config = join(state, 'config')
  mkdirSync(config, { recursive: true })
  const userConfig = join(config, 'npmrc')
  writeFileSync(userConfig, '')
  const store = storeDir(stage)
  mkdirSync(store, { recursive: true })

  console.log(`[便携包] ${label}`)
  const child = spawnSync(nodeExe, [
    pnpmEntry,
    `--config.store-dir=${store}`,
    '--config.enable-global-virtual-store=false',
    `--config.userconfig=${userConfig}`,
    ...args,
  ], {
    cwd,
    stdio: 'inherit',
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([name]) => (
        !/^DSH_DESKTOP_/u.test(name) && !/^(?:npm|pnpm|corepack)_/iu.test(name)
      ))),
      NPM_CONFIG_STORE_DIR: store,
      NPM_CONFIG_USERCONFIG: userConfig,
      PATH: `${dirname(nodeExe)}${delimiter}${process.env.PATH ?? ''}`,
      XDG_CACHE_HOME: join(state, 'cache'),
      XDG_CONFIG_HOME: config,
      XDG_STATE_HOME: join(state, 'state'),
    },
  })
  if (child.status !== 0) throw new Error(`${label} 失败（退出码 ${child.status}）`)
}

/**
 * Install the checkout's production graph into the store, then drop the tree.
 * @param options - `{ stage, nodeExe, pnpmEntry }`.
 */
export function prepareRepoStore({ stage, nodeExe, pnpmEntry }) {
  const root = resolve(stage)
  stripDevPostinstall(root)
  linkWorkspacePackages(root)
  // Not frozen: the root dependency list above is new, so this is the install
  // that writes the lockfile the target later installs from offline.
  runPnpm({
    stage,
    nodeExe,
    pnpmEntry,
    cwd: root,
    args: ['install', '--prod', '--trust-lockfile'],
    label: '安装仓库生产依赖并固化到离线 store',
  })
  rmSync(join(root, 'node_modules'), { recursive: true, force: true })
}

/**
 * Drop the workspace root's `postinstall`, which installs the lefthook git
 * hooks the development checkout needs. The archive is a deployment, not a
 * checkout, and that script cannot resolve under `--prod` at all.
 * @param root - the staged package root.
 */
function stripDevPostinstall(root) {
  const path = join(root, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  if (manifest.scripts?.postinstall === undefined) return
  delete manifest.scripts.postinstall
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log('[便携包] 已移除开发专用的根 postinstall（lefthook）')
}

/**
 * Depend on every workspace package from the root. Workspace members declare
 * `@deepseek-ai/cordis` and their siblings as peers or dev dependencies, both
 * of which `--prod` drops, so without this the runtime cannot resolve them;
 * the root is the one directory every package's `node_modules` walk reaches.
 * @param root - the staged package root.
 */
function linkWorkspacePackages(root) {
  const manifests = []
  const collect = (dir) => {
    let entry
    try {
      entry = statSync(dir)
    } catch {
      return
    }
    if (!entry.isDirectory() || !existsSync(join(dir, 'package.json'))) return
    manifests.push(join(dir, 'package.json'))
  }
  const groups = join(root, 'packages')
  if (existsSync(groups)) {
    for (const group of readdirSync(groups)) {
      const groupDir = join(groups, group)
      if (!statSync(groupDir).isDirectory()) continue
      for (const name of readdirSync(groupDir)) collect(join(groupDir, name))
    }
  }
  for (const top of ['vendor', 'apps']) {
    const topDir = join(root, top)
    if (!existsSync(topDir)) continue
    for (const name of readdirSync(topDir)) collect(join(topDir, name))
  }
  const names = manifests
    .map(manifest => JSON.parse(readFileSync(manifest, 'utf8')).name)
    .filter(name => typeof name === 'string')
  const path = join(root, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  manifest.dependencies = Object.fromEntries(names.sort().map(name => [name, 'workspace:*']))
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`[便携包] 已把 ${names.length} 个工作区包挂到包根依赖`)
}

/**
 * Run the community seed in the staged home, then install the profile's
 * plugins into the same store and drop the profile tree.
 * @param options - `{ stage, dshHomeDir, repoDir, nodeExe, pnpmEntry, prepare, finalize }`.
 */
export async function prepareProfileStore({ stage, dshHomeDir, repoDir, nodeExe, pnpmEntry, prepare, finalize }) {
  const seed = join(repoDir, 'community', 'seed.mjs')
  if (!existsSync(seed)) throw new Error(`缺少社区 seed 脚本：${seed}`)
  console.log('[便携包] 生成 profile 清单（跳过其自身安装）')
  const seeded = spawnSync(nodeExe, [seed], {
    cwd: repoDir,
    stdio: 'inherit',
    env: { ...process.env, DSH_HOME: dshHomeDir, DSH_SEED_SKIP_INSTALL: '1' },
  })
  if (seeded.status !== 0) throw new Error(`社区 seed 失败（退出码 ${seeded.status}）`)

  const profile = join(dshHomeDir, 'profiles', 'web')
  if (!existsSync(join(profile, 'package.json'))) throw new Error(`seed 未写出 profile：${profile}`)
  for (const line of await prepare(profile)) console.log(`[便携包] ${line}`)
  // Not frozen: seeding and repacking change specifiers, so this install is the
  // one that refreshes the lockfile; the target then installs from it offline.
  runPnpm({
    stage,
    nodeExe,
    pnpmEntry,
    cwd: profile,
    args: ['install', '--trust-lockfile'],
    label: '安装 profile 插件并固化到离线 store',
  })
  for (const line of finalize(profile)) console.log(`[便携包] ${line}`)
  rmSync(join(profile, 'node_modules'), { recursive: true, force: true })
}

/**
 * Delete pnpm's build-time state and report the store size.
 * @param options - `{ stage, formatSize }`.
 * @returns the store size in bytes.
 */
export function finishStore({ stage, formatSize }) {
  rmSync(join(resolve(stage), STATE_DIR_NAME), { recursive: true, force: true })
  const store = storeDir(stage)
  const measured = spawnSync('powershell', ['-NoProfile', '-Command',
    `(Get-ChildItem -LiteralPath '${store}' -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum`,
  ], { encoding: 'utf8' })
  const bytes = Number(measured.stdout?.trim()) || 0
  console.log(`[便携包] 离线 store 就绪：${formatSize(bytes)}`)
  return bytes
}
