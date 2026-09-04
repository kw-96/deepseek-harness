#!/usr/bin/env node
/**
 * web profile 环境引导脚本：在任意主机上把 `dsh web` 所需的外部插件与
 * 依赖解析修正一次性就绪，保证另一台主机 clone 仓库后运行 `dsh web`
 * 不会触发 dsh-doc 的原生绑定缺失错误。
 *
 * 前置条件：
 * - 已在本仓库根目录执行过 `pnpm install`（`node --import tsx/esm` 可用）。
 * - 网络可访问 npm registry 与插件各自的 git 仓库。
 *
 * 用法（在仓库根目录执行）：
 *   node scripts/setup-web-profile.mjs
 *
 * 幂等：可重复执行。profile 已存在时只补齐缺失的 pnpm-workspace 片段；
 * 插件已安装时 pnpm add 就地保持/升级，不破坏既有配置。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

/** 需要安装到 web profile 的外部插件（与 package.json dependencies 的 spec 一致）。 */
const PLUGIN_SPECS = [
  'dsh-plugin-marketplace@git+https://github.com/bradeGithub/DSH-Plugins-Marketplace.git',
  '@huiliyi37/dsh-office@^0.2.1',
  'dsh-doc@^0.1.1',
  'dsh-ocr-local@^0.2.7',
  '@dsh-external/dsh-kb-sieve@github:omdsh-dev/dsh-kb-sieve',
  'dsh-plugin-manager@^0.1.0',
]

const LEGACY_MARKETPLACE_PACKAGE = 'ntes-dsh-market'

/** pnpm-workspace.yaml 基础内容（与 app-boot initProfile 生成的模板一致）。 */
const WORKSPACE_BASE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

/** dsh-ocr-local@0.2.7 发布过新，需豁免 pnpm 的 minimumReleaseAge 限制。 */
const MINIMUM_RELEASE_AGE_EXCLUDE = `minimumReleaseAgeExclude:
  - dsh-ocr-local@0.2.7
`

/** 修复 @xberg-io/xberg@1.0.14 引用未发布 win32 平台包的问题（降级到已发布的 rc.15）。 */
const XBERG_OVERRIDE = `overrides:
  '@xberg-io/xberg': 1.0.0-rc.15
`

/** 计算 web profile 目录：$DSH_HOME 优先，否则 ~/.dsh。 */
function profileDir() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'profiles', 'web')
}

/** 确保 pnpm-workspace.yaml 含所需片段；缺失则补齐（幂等）。 */
function ensureWorkspace(dir) {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'pnpm-workspace.yaml')
  let content = existsSync(path) ? readFileSync(path, 'utf8') : WORKSPACE_BASE
  if (!content.includes('minimumReleaseAgeExclude')) {
    content = content.replace(/\s*$/, '') + '\n' + MINIMUM_RELEASE_AGE_EXCLUDE + '\n'
  }
  if (!content.includes("'@xberg-io/xberg'")) {
    content = content.replace(/\s*$/, '') + '\n' + XBERG_OVERRIDE + '\n'
  }
  writeFileSync(path, content)
}

/** 移除已下架市场插件的依赖与 bundle 残留，避免 pnpm 解析失败。 */
function removeLegacyMarketplace(dir) {
  const path = join(dir, 'package.json')
  if (!existsSync(path)) return false
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  let changed = false
  if (manifest.dependencies?.[LEGACY_MARKETPLACE_PACKAGE] !== undefined) {
    delete manifest.dependencies[LEGACY_MARKETPLACE_PACKAGE]
    changed = true
  }
  const bundles = manifest.dsh?.profile?.bundles
  if (Array.isArray(bundles) && bundles.includes(LEGACY_MARKETPLACE_PACKAGE)) {
    manifest.dsh.profile.bundles = bundles.filter(item => item !== LEGACY_MARKETPLACE_PACKAGE)
    changed = true
  }
  if (changed) writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  return changed
}

/** 运行一次 dsh 命令（走与 `pnpm dsh` 相同的源码入口，无 shell 转义差异）。 */
function runDsh(args) {
  const bin = join(process.cwd(), 'apps', 'cli', 'src', 'bin.ts')
  const result = spawnSync(process.execPath, ['--import', 'tsx/esm', bin, ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

/** 主流程：先写 workspace 配置，再装插件，最后校验原生绑定并兜底重装。 */
function main() {
  const bin = join(process.cwd(), 'apps', 'cli', 'src', 'bin.ts')
  if (!existsSync(bin)) {
    console.error('[setup-web-profile] 请在仓库根目录运行本脚本（未找到 apps/cli/src/bin.ts）。')
    process.exit(1)
  }
  const dir = profileDir()
  console.log(`[setup-web-profile] 目标 profile 目录：${dir}`)
  ensureWorkspace(dir)
  if (removeLegacyMarketplace(dir)) {
    console.log('[setup-web-profile] 已移除已下架的 ntes-dsh-market 配置')
  }
  console.log('[setup-web-profile] 已确保 pnpm-workspace.yaml 含 overrides 与 minimumReleaseAgeExclude')
  console.log('[setup-web-profile] 安装外部插件（触发 pnpm install，override 随之生效）...')
  runDsh(['plugin', '--profile', 'web', 'add', ...PLUGIN_SPECS])
  const bindingDir = join(dir, 'node_modules', '@xberg-io', 'xberg-win32-x64-msvc')
  if (!existsSync(bindingDir)) {
    console.log('[setup-web-profile] 未检测到 win32 原生绑定，重跑 install 兜底...')
    runDsh(['plugin', '--profile', 'web', 'install'])
  }
  console.log('[setup-web-profile] 完成。可运行：pnpm dsh web')
}

main()
