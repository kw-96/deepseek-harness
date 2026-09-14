/**
 * Pack this host's DeepSeek Harness deployment into one archive a clean host of
 * the same architecture runs with no preinstalled runtime, no network, and no
 * plugin or configuration work:
 *
 *   node community/portable.mjs check              # is this host packable?
 *   node community/portable.mjs pack               # write the archive
 *   node community/portable.mjs pack --dry-run     # report sizes only
 *
 * The archive is the checkout itself — so `DeepSeek Harness.exe` finds
 * `dsh.cmd` beside it exactly as it does in a development checkout — plus a
 * bundled Node.js and pnpm, the offline store both installs read from, and a
 * prefilled Harness home. Package on the architecture you intend to run on:
 * the store and the runtime are both architecture-specific.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import { mkdir, stat } from 'node:fs/promises'
import { readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import {
  HOME_EXCLUDES, REPO_EXCLUDES, apparentSize, checkHost, copyTree, dshHome, excluded,
  formatSize, packArch, repoRoot,
} from './host.mjs'
import { prepareNode, preparePnpm, writeRuntimeRecord } from './runtime.mjs'
import { finishStore, prepareProfileStore, prepareRepoStore } from './store.mjs'
import { repackUnavailableDeps, rewritePackageRootPaths, stripCommunityDevHmrPatch } from './profile.mjs'
import { materializeLocalBundles } from './tarballs.mjs'
import { writeFreshnessMarkers, writeLauncher } from './launcher.mjs'

/** Root-level build residue that must not travel (but `apps/web/dist` must). */
const ROOT_ONLY_EXCLUDES = ['dist', '.portable-staging']

/** Other-architecture Node.js trees the packed runtime makes redundant. */
function pruneForeignRuntimes(stage, archName) {
  const runtime = join(stage, '.runtime')
  rmSync(join(runtime, '.pnpm-extract'), { recursive: true, force: true })
  for (const entry of readdirSync(runtime)) {
    const foreign = ['x64', 'arm64'].some(other => other !== archName && entry.endsWith(`-win-${other}`))
    if (entry.startsWith('node-v') && foreign) rmSync(join(runtime, entry), { recursive: true, force: true })
  }
}

/**
 * Stage, prepare, and compress one portable package.
 * @param options - `{ outDir, withGit, dryRun }`.
 * @returns the staged directory, or undefined when nothing was staged.
 */
async function pack(options) {
  if (!checkHost()) return undefined
  const archName = packArch()
  // Staged outside the checkout: `fs.cp` refuses to copy a tree into itself.
  const stagingRoot = join(tmpdir(), 'dsh-portable-staging')
  const name = `dsh-portable-${archName}-${new Date().toISOString().slice(0, 10)}`
  const stage = join(stagingRoot, name)
  const archive = join(options.outDir, `${name}.tar.gz`)
  const manifest = {
    arch: archName,
    platform: process.platform,
    node: process.version,
    packedAt: new Date().toISOString(),
    withGit: options.withGit,
  }

  if (options.dryRun) {
    console.log('\n打包计划（--dry-run，不写入任何文件）')
    console.log(`  目标架构            ${archName}（只能在 ${archName} 的 Windows 上运行）`)
    console.log(`  仓库源码与构建产物  ${formatSize(apparentSize(repoRoot, REPO_EXCLUDES))}`)
    console.log(`  profile 与技能      ${formatSize(apparentSize(join(dshHome, 'profiles')))}`)
    console.log(`  产物                ${archive}`)
    return undefined
  }

  rmSync(stage, { recursive: true, force: true })
  const repoExcludes = [...REPO_EXCLUDES, ...(options.withGit ? [] : ['.git'])]
  await mkdir(stage, { recursive: true })
  console.log(`[便携包] 暂存到 ${stage}`)
  copyTree(repoRoot, stage, (source) => {
    const rel = source.slice(repoRoot.length + 1).replaceAll('\\', '/')
    if (rel.startsWith('community/plugins/packages/') && rel.includes('/node_modules')) return false
    if (ROOT_ONLY_EXCLUDES.some(entry => rel === entry || rel.startsWith(`${entry}/`))) return false
    return !excluded(rel, repoExcludes)
  })
  console.log('[便携包] 仓库已复制')
  const stagedHome = join(stage, 'dsh-home')
  copyTree(dshHome, stagedHome, (source) => {
    const rel = source.slice(dshHome.length + 1).replaceAll('\\', '/')
    if (rel.startsWith('profiles/') && rel.includes('.bak-')) return false
    return !excluded(rel, HOME_EXCLUDES)
  })
  console.log('[便携包] profile、技能与全局配置已复制')

  const runtimeDir = join(stage, '.runtime')
  const nodeDir = await prepareNode(runtimeDir, archName)
  const pnpmDir = await preparePnpm(runtimeDir)
  writeRuntimeRecord(runtimeDir, archName)
  const toolchain = {
    stage,
    nodeExe: join(nodeDir, 'node.exe'),
    pnpmEntry: join(pnpmDir, 'bin', 'pnpm.cjs'),
  }
  prepareRepoStore(toolchain)
  const profileDir = join(stagedHome, 'profiles', 'web')
  for (const line of materializeLocalBundles({
    profileDir,
    tarballsDir: join(stage, 'community', 'plugins', 'tarballs'),
    fallbackDir: join(stagedHome, 'profiles', 'node_modules'),
  })) {
    console.log(`[便携包] ${line}`)
  }
  await prepareProfileStore({
    ...toolchain,
    dshHomeDir: stagedHome,
    repoDir: stage,
    prepare: (profile) => repackUnavailableDeps({
      profileDir: profile,
      tarballsDir: join(stage, 'community', 'plugins', 'tarballs'),
      hostProfileDir: join(dshHome, 'profiles', 'web'),
    }),
    finalize: (profile) => [
      ...stripCommunityDevHmrPatch({ profileDir: profile }),
      `把 ${rewritePackageRootPaths({ profileDir: profile, roots: [repoRoot, stage] })} 处包内绝对路径改成相对路径`,
    ],
  })
  finishStore({ stage, formatSize })
  pruneForeignRuntimes(stage, archName)

  writeLauncher({ stage, archName, manifest })
  writeFreshnessMarkers(stage)
  await mkdir(options.outDir, { recursive: true })
  console.log('[便携包] 正在压缩...')
  const tarred = spawnSync('tar', ['-czf', archive, '-C', stagingRoot, name], { stdio: 'inherit' })
  if (tarred.status !== 0) {
    console.error('[便携包] 压缩失败')
    return undefined
  }
  console.log(`\n[便携包] 完成 → ${archive}（${formatSize((await stat(archive)).size)}）`)
  console.log(`        放到 ${archName} 的 Windows 上解压，双击 DeepSeek Harness.exe 即可`)
  return stage
}

const options = {
  outDir: resolve(process.env.PORTABLE_OUT ?? repoRoot),
  withGit: process.argv.includes('--with-git'),
  dryRun: process.argv.includes('--dry-run'),
}

if (process.argv[2] === 'check') {
  process.exit(checkHost() ? 0 : 1)
} else if (process.argv[2] === 'pack') {
  await pack(options)
} else {
  console.log('用法：node community/portable.mjs check | pack [--dry-run] [--with-git]；PORTABLE_OUT 指定输出目录')
}
