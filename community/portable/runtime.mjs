/**
 * Provision the Node.js and pnpm the portable package runs on, so a target
 * host needs neither installed: downloads the official Node.js archive for the
 * packed architecture and the pinned pnpm release, verifies the Node.js
 * checksum against the release `SHASUMS256.txt`, and unpacks both into the
 * staging tree.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLED_NODE_VERSION, BUNDLED_PNPM_VERSION, nodeArchiveArch, nodeRuntimeDirName } from './host.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const downloadRoot = join(here, '.downloads')

/**
 * Download a URL into the shared download cache unless it is already there.
 * @param url - absolute source URL.
 * @param destination - absolute file path inside the cache.
 * @returns the cached file path.
 */
async function cachedDownload(url, destination) {
  if (existsSync(destination)) return destination
  mkdirSync(dirname(destination), { recursive: true })
  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载失败：${url} 返回 HTTP ${response.status}`)
  const body = Buffer.from(await response.arrayBuffer())
  writeFileSync(destination, body)
  return destination
}

/**
 * Run one child process and fail with its tail when it exits non-zero.
 * @param command - executable to run.
 * @param args - command arguments.
 * @param cwd - working directory.
 */
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false })
  if (result.status !== 0) throw new Error(`命令失败（退出码 ${result.status}）：${command} ${args.join(' ')}`)
}

/**
 * Download and unpack the official Node.js release for one architecture.
 * @param runtimeDir - the staged `.runtime` directory.
 * @param archName - `x64` or `arm64`.
 * @returns the absolute directory holding `node.exe`.
 */
export async function prepareNode(runtimeDir, archName) {
  runtimeDir = resolve(runtimeDir)
  const target = join(runtimeDir, nodeRuntimeDirName(archName))
  if (existsSync(join(target, 'node.exe'))) {
    console.log(`[便携包] 内置 Node 已就绪：${nodeRuntimeDirName(archName)}`)
    return target
  }
  const suffix = nodeArchiveArch(archName)
  if (suffix === undefined) throw new Error(`Node.js 未发布该架构的 Windows 版本：${archName}`)
  const archiveName = `node-v${BUNDLED_NODE_VERSION}-win-${suffix}.zip`
  const releaseRoot = `https://nodejs.org/dist/v${BUNDLED_NODE_VERSION}`
  const archive = await cachedDownload(`${releaseRoot}/${archiveName}`, join(downloadRoot, archiveName))
  const sumsPath = await cachedDownload(`${releaseRoot}/SHASUMS256.txt`, join(downloadRoot, `SHASUMS256-${BUNDLED_NODE_VERSION}.txt`))

  const manifest = readFileSync(sumsPath, 'utf8').split(/\r?\n/u)
    .find(line => line.endsWith(`  ${archiveName}`))
  if (manifest === undefined) throw new Error(`SHASUMS256.txt 里没有 ${archiveName}`)
  const expected = manifest.split(/\s+/u)[0]
  const actual = createHash('sha256').update(readFileSync(archive)).digest('hex')
  if (actual !== expected) throw new Error(`内置 Node 校验失败：${archiveName} 的 sha256 不匹配`)

  mkdirSync(runtimeDir, { recursive: true })
  run('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${runtimeDir}' -Force`,
  ], runtimeDir)
  if (!existsSync(join(target, 'node.exe'))) throw new Error(`内置 Node 解压后缺少 node.exe：${target}`)
  console.log(`[便携包] 内置 Node ${BUNDLED_NODE_VERSION}（${suffix}）已写入`)
  return target
}

/**
 * Download and unpack the pinned pnpm release.
 * @param runtimeDir - the staged `.runtime` directory.
 * @returns the absolute pnpm package directory.
 */
export async function preparePnpm(runtimeDir) {
  runtimeDir = resolve(runtimeDir)
  const target = join(runtimeDir, 'pnpm')
  const entry = join(target, 'bin', 'pnpm.cjs')
  if (existsSync(entry)) {
    console.log('[便携包] 内置 pnpm 已就绪')
    return target
  }
  const archiveName = `pnpm-${BUNDLED_PNPM_VERSION}.tgz`
  const archive = await cachedDownload(
    `https://registry.npmjs.org/pnpm/-/${archiveName}`,
    join(downloadRoot, archiveName),
  )
  const extract = join(runtimeDir, '.pnpm-extract')
  rmSync(extract, { recursive: true, force: true })
  mkdirSync(extract, { recursive: true })
  run('tar', ['-xzf', archive, '-C', extract], extract)
  rmSync(target, { recursive: true, force: true })
  renameSync(join(extract, 'package'), target)
  rmSync(extract, { recursive: true, force: true })
  if (!existsSync(entry)) throw new Error(`内置 pnpm 解压后缺少 bin/pnpm.cjs：${target}`)
  console.log(`[便携包] 内置 pnpm ${BUNDLED_PNPM_VERSION} 已写入`)
  return target
}

/**
 * Record the packed runtime identity beside the executables.
 * @param runtimeDir - the staged `.runtime` directory.
 * @param archName - packed architecture.
 */
export function writeRuntimeRecord(runtimeDir, archName) {
  writeFileSync(join(runtimeDir, 'portable-runtime.json'), `${JSON.stringify({
    schemaVersion: 1,
    arch: archName,
    node: BUNDLED_NODE_VERSION,
    pnpm: BUNDLED_PNPM_VERSION,
    packedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8')
}
