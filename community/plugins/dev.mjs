#!/usr/bin/env node
/**
 * 社区自研插件开发热替换闭环：把全部（或指定）自研插件以源码 link 挂载进
 * web profile，在 profile 的 cordis.patch.yml 启用 Cordis HMR 并指向插件
 * 源码，再启动每个插件的 watch 构建。修改任一插件源码后，host 侧由 Cordis
 * HMR 热替换，client 侧由 dsh web 的 client-hmr 推送浏览器热重载，无需
 * 重启服务或手动刷新。
 *
 * 用法：
 *   node community/plugins/dev.mjs               # 全部自研插件
 *   node community/plugins/dev.mjs codex-shell   # 仅指定插件
 *
 * 前置：dsh web（或桌面壳）已运行，且各插件源码已构建过一次。
 */

import { spawn } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const packagesDir = join(here, 'packages')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', 'web')
const patchFile = join(profileDir, 'cordis.patch.yml')

/** 发现自研插件目录；返回 { dirName, name, dir }。 */
function discoverPlugins() {
  const wanted = process.argv.slice(2)
  const result = []
  for (const dirName of readdirSync(packagesDir).sort()) {
    const dir = join(packagesDir, dirName)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    if (wanted.length > 0 && !wanted.includes(dirName)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (typeof manifest.name !== 'string' || manifest.dsh?.bundle?.patch === undefined) continue
    result.push({ dirName, name: manifest.name, dir })
  }
  if (result.length === 0) {
    console.error('dev: 未发现社区 bundle 插件（community/plugins/packages/* 且声明 dsh.bundle.patch）')
    process.exit(1)
  }
  return result
}

const plugins = discoverPlugins()
const watchOnly = process.argv.includes('--watch-only')

/** 在 profile patch 顶层数组末尾追加 hmr 行（幂等）。 */
function enableHmr(root) {
  const before = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : '[]\n'
  if (before.includes('id: hmr')) return
  // cordis.patch.yml 顶层是 flow collection（`[ {…}, {…} ]`），hmr 条目必须用
  // 同款 flow 语法；旧的块序列写法（`- id: hmr`）会触发 YAML 解析失败。
  const entry = [
    '  # Managed by community dev: enable Cordis HMR for linked plugins.',
    '  {',
    '    id: hmr,',
    '    disabled: false,',
    '    config: {',
    '      root: [',
    `        ${root.replace(/\\/g, '/')}`,
    '      ]',
    '    }',
    '  }',
  ].join('\n')
  const close = before.lastIndexOf(']')
  const next = close < 0
    ? `${before.trimEnd()}\n[\n${entry}\n]\n`
    : `${before.slice(0, close).trimEnd()},\n${entry}\n${before.slice(close)}`
  writeFileSync(patchFile, next)
}

/** 确保 profile 的 bundle 列表包含该插件名（幂等）。 */
function ensureBundle(name) {
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const bundles = manifest.dsh?.profile?.bundles ?? []
  if (bundles.includes(name)) return
  bundles.push(name)
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

if (!watchOnly) {
  enableHmr(packagesDir)
  console.log(`[dev] 已启用 Cordis HMR，root=${packagesDir}`)

  // 用 junction 把每个自研插件从源码目录挂载进 profile。pnpm 的 `link:`
  // 在 Windows 上会把盘符绝对路径误当相对路径，生成指向
  // `profile\<盘符>\...` 的坏 junction；这里直接创建正确 junction，
  // 不依赖 pnpm 的 link 解析，profile 依赖仍保持 file: tarball。
  for (const plugin of plugins) {
    const target = join(profileDir, 'node_modules', plugin.name)
    console.log(`[dev] junction 挂载 ${plugin.name} → ${plugin.dir}`)
    try {
      const stat = lstatSync(target)
      if (stat.isSymbolicLink()) unlinkSync(target)
      else rmSync(target, { recursive: true, force: true })
    } catch {
      // 目标不存在则忽略。
    }
    // 作用域包（如 @ruihuahe/...）的父目录在全新 profile 上尚不存在，
    // junction 的创建要求目标父目录就位。
    mkdirSync(dirname(target), { recursive: true })
    symlinkSync(plugin.dir, target, 'junction')
    ensureBundle(plugin.name)
  }
}

// 启动 watch 构建：双面插件跑 host/client 两套 tsc + tsdown，单面插件只跑 tsc。
const stages = []
const run = (label, command, args, cwd) => {
  const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  stages.push({ label, kill: () => { child.kill() } })
  child.on('exit', (code) => {
    if (code === 0 || child.killed) return
    console.error(`dev: ${label} 退出（code ${String(code)}），产物链已失效`)
    process.exit(1)
  })
}

const bin = join(repoRoot, 'node_modules', '.bin')
const tsc = join(bin, process.platform === 'win32' ? 'tsc.cmd' : 'tsc')
const tsdown = join(bin, process.platform === 'win32' ? 'tsdown.cmd' : 'tsdown')

for (const plugin of plugins) {
  if (existsSync(join(plugin.dir, 'tsdown.client.config.ts'))) {
    run(`${plugin.dirName} tsc host`, tsc, ['-p', 'tsconfig.host.json', '--watch'], plugin.dir)
    run(`${plugin.dirName} tsc client`, tsc, ['-p', 'tsconfig.client.json', '--watch'], plugin.dir)
    run(`${plugin.dirName} tsdown host`, tsdown, ['--config', 'tsdown.host.config.ts', '--watch'], plugin.dir)
    run(`${plugin.dirName} tsdown client`, tsdown, ['--config', 'tsdown.client.config.ts', '--watch'], plugin.dir)
  } else {
    run(`${plugin.dirName} tsc`, tsc, ['-p', 'tsconfig.json', '--watch'], plugin.dir)
  }
}

const stop = () => {
  for (const stage of stages) stage.kill()
  process.exit(0)
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

console.log(`[dev] 已启动 ${plugins.length} 个自研插件的 watch，修改源码即可热替换（Ctrl+C 结束）`)
