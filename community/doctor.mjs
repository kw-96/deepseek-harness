#!/usr/bin/env node
/**
 * Diagnose this host's DeepSeek Harness deployment and print the exact
 * commands that repair it. Run it from the repository root:
 *
 *   node community/doctor.mjs
 *
 * Exit code is 0 when nothing failed, 1 when at least one check failed.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import {
  GITHUB_BUNDLES, NATIVE_BUNDLE_LIMITS, REQUIRED_NODE_RANGE, REQUIRED_PNPM_VERSION,
  nodeVersionSupported, probe,
} from './preflight.mjs'
import { bundleAnchors, droppedBundles, repairProfile, unresolvableBundles } from './profile.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const tarballsUrl = join(repoRoot, 'community', 'plugins', 'tarballs').replaceAll('\\', '/')
const profileDir = join(dshHome, 'profiles', 'web')
const host = { platform: process.platform, arch: process.arch }

const findings = []

/**
 * Record one check outcome.
 * @param level - `通过`, `警告`, or `失败`.
 * @param title - the one-line result.
 * @param detail - optional explanation of the cause or impact.
 * @param fix - optional command or action that resolves it.
 */
function record(level, title, detail, fix) {
  findings.push({ level, title, detail, fix })
}

/**
 * Run a command through the platform shell and capture its stdout. The command
 * line is built as one string because passing an argument array together with
 * `shell: true` raises DEP0190.
 * @param command - executable name, resolved through PATH.
 * @param args - argument list; arguments containing spaces are quoted.
 * @returns trimmed stdout, or undefined when the command is absent or failed.
 */
function run(command, args) {
  const line = [command, ...args].map(part => (part.includes(' ') ? `"${part}"` : part)).join(' ')
  const result = spawnSync(line, { shell: true, encoding: 'utf8' })
  return result.status === 0 ? (result.stdout ?? '').trim() : undefined
}

if (nodeVersionSupported(process.version)) {
  record('通过', `Node.js ${process.version}`)
} else {
  record('失败', `Node.js ${process.version} 不在支持范围内`, `需要 ${REQUIRED_NODE_RANGE}`,
    'winget install OpenJS.NodeJS.LTS   （装完重开一个终端）')
}

const pnpmVersion = run('pnpm', ['--version'])
if (pnpmVersion === undefined) {
  record('失败', 'pnpm 未安装或不在 PATH 中', undefined, `npm install -g pnpm@${REQUIRED_PNPM_VERSION}`)
} else if (pnpmVersion !== REQUIRED_PNPM_VERSION) {
  record('警告', `pnpm ${pnpmVersion} 与仓库锁定版本不一致`,
    `package.json 的 packageManager 要求 ${REQUIRED_PNPM_VERSION}`, `npm install -g pnpm@${REQUIRED_PNPM_VERSION}`)
} else {
  record('通过', `pnpm ${pnpmVersion}`)
}

const gitVersion = run('git', ['--version'])
if (gitVersion === undefined) {
  record('失败', 'Git 未安装或不在 PATH 中', undefined,
    'winget install --id Git.Git -e --source winget   （装完重开一个终端）')
} else {
  record('通过', gitVersion)
}

if (process.platform === 'win32') {
  const policy = run('powershell', ['-NoProfile', '-Command', 'Get-ExecutionPolicy'])
  if (policy === undefined) {
    record('警告', '无法读取 PowerShell 执行策略')
  } else if (policy === 'Restricted' || policy === 'AllSigned') {
    record('警告', `PowerShell 执行策略为 ${policy}，npm 与 pnpm 的 .ps1 入口会被拦截`,
      '表现为「无法加载文件 npm.ps1，因为在此系统上禁止运行脚本」',
      'Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned')
  } else {
    record('通过', `PowerShell 执行策略 ${policy}`)
  }
}

record('通过', `平台 ${host.platform} / ${host.arch}`)
for (const limit of NATIVE_BUNDLE_LIMITS) {
  if (!limit.unsupported(host.platform, host.arch)) continue
  record('警告', `${limit.name} 在当前平台不可用`, limit.detail,
    'node community/seed.mjs 会自动把它从 profile 中移除')
}

const githubReachable = await probe('https://github.com')
if (githubReachable) {
  record('通过', 'github.com 可达')
} else {
  record('警告', 'github.com 不可达',
    `profile 中的 ${GITHUB_BUNDLES.join('、')} 走 GitHub 直连，安装会失败`,
    '配置代理，或直接运行 node community/seed.mjs 让它自动跳过')
}

const internalReachable = await probe('https://npm.nie.netease.com/')
record('通过', internalReachable
  ? '网易内部 registry 可达，seed 会装载完整 profile'
  : '网易内部 registry 不可达，seed 会装载公网 profile')

if (existsSync(join(repoRoot, 'node_modules'))) {
  record('通过', '仓库依赖已安装')
} else {
  record('失败', '仓库依赖未安装', undefined, 'pnpm install')
}

if (!existsSync(join(profileDir, 'package.json'))) {
  record('失败', `profile 尚未初始化：${profileDir}`, undefined, 'node community/seed.mjs')
} else {
  const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  // The drift check mirrors seed's repair path, which never weighs the network:
  // a bundle already installed keeps working offline.
  const expected = droppedBundles({ internal: true, githubReachable: true, ...host })
  for (const [name, reason] of unresolvableBundles(pkg, bundleAnchors({ repoRoot, profileDir, dshHome }))) {
    expected.set(name, reason)
  }
  const changes = repairProfile(structuredClone(pkg), { tarballsUrl, dropped: expected })
  if (changes.length === 0) {
    record('通过', 'profile 配置与当前仓库一致')
  } else {
    record('失败', 'profile 配置已过期，需要修复', changes.join('\n       '), 'node community/seed.mjs')
  }
}

console.log('DeepSeek Harness 部署自检')
console.log(`仓库      ${repoRoot}`)
console.log(`profile   ${profileDir}`)
console.log(`平台      ${host.platform} / ${host.arch}`)
console.log('-'.repeat(64))
for (const { level, title, detail, fix } of findings) {
  console.log(`[${level}] ${title}`)
  if (detail !== undefined) console.log(`        ${detail}`)
  if (fix !== undefined) console.log(`        修复：${fix}`)
}
console.log('-'.repeat(64))

const failed = findings.filter(finding => finding.level === '失败').length
const warned = findings.filter(finding => finding.level === '警告').length
console.log(failed === 0 && warned === 0
  ? '自检全部通过，可以直接运行 pnpm dsh web'
  : `自检完成：${failed} 项失败，${warned} 项警告`)
process.exit(failed === 0 ? 0 : 1)
