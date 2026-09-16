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
 * 已下线插件（`community/profiles/web/retired.json` 列出的包名）不挂载、不登记、
 * 也不开 watch：它们的源码保留可回退，但不再属于 profile；把它们移出该清单即可
 * 恢复挂载。
 *
 * 前置：dsh web（或桌面壳）已运行，且各插件源码已构建过一次。
 */

import { spawn } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { findRootArrayClose } from '../profile.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const packagesDir = join(here, 'packages')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', 'web')
const patchFile = join(profileDir, 'cordis.patch.yml')

/** 已下线插件名单；与播种共用同一份清单。 */
function readRetired() {
  const path = join(here, '..', 'profiles', 'web', 'retired.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
}

/** 发现自研插件目录；返回 { dirName, name, dir }。 */
function discoverPlugins() {
  const wanted = process.argv.slice(2)
  const retired = readRetired()
  const result = []
  const skipped = []
  for (const dirName of readdirSync(packagesDir).sort()) {
    const dir = join(packagesDir, dirName)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    if (wanted.length > 0 && !wanted.includes(dirName)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (typeof manifest.name !== 'string' || manifest.dsh?.bundle?.patch === undefined) continue
    // 播种每次启动都会把已下线插件从 profile 里删掉；这里再挂回去只会形成
    // 「启动删、dev 加」的拉锯，并让它们在清单里看起来从未下线。
    if (retired.includes(manifest.name)) {
      console.log(`[dev] 跳过已下线插件 ${manifest.name}（见 community/profiles/web/retired.json）`)
      skipped.push(manifest.name)
      continue
    }
    result.push({ dirName, name: manifest.name, dir })
  }
  if (result.length === 0) {
    console.error(skipped.length > 0
      ? `dev: 选中的社区 bundle 插件均已下线（${skipped.join('、')}），见 community/profiles/web/retired.json`
      : 'dev: 未发现社区 bundle 插件（community/plugins/packages/* 且声明 dsh.bundle.patch）')
    process.exit(1)
  }
  return result
}

const plugins = discoverPlugins()
const watchOnly = process.argv.includes('--watch-only')

/** 在 profile patch 顶层序列末尾追加 hmr 行（幂等）。 */
function enableHmr(root) {
  const before = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : '[]\n'
  if (before.includes('id: hmr')) return
  // 顶层可能是 flow 数组（`[ {…} ]`），也可能是插件管理器改写出的块序列
  // （`- {…}`）：前者插到顶层闭合方括号前，后者在文件末尾追加一行。绝不能用
  // lastIndexOf(']')——它会命中前面某行 config 里的嵌套数组（如 hmr 自己的
  // root: [ … ]），把 hmr 行拼进别人的 config。
  const rootLiteral = JSON.stringify(root.replace(/\\/g, '/'))
  const row = `{ id: hmr, disabled: false, config: { root: [${rootLiteral}] } }`
  const comment = '  # Managed by community dev: enable Cordis HMR for linked plugins.'
  const close = findRootArrayClose(before)
  if (close < 0) {
    writeFileSync(patchFile, `${before.trimEnd()}\n${comment}\n- ${row}\n`)
    return
  }
  const body = before.slice(0, close).trimEnd()
  const separator = body.endsWith('[') || body.endsWith(',') ? '' : ','
  writeFileSync(patchFile, `${body}${separator}\n${comment}\n  ${row}\n${before.slice(close)}`)
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

/**
 * 把「只由 agent 预设挂载」的插件（没有 bundle 补丁的那些）连接进 harness
 * 安装目录与 profile 的 node_modules。
 *
 * 预设组成里的包名按安装位置解析——用户目录下的预设不是这些包的解析根，
 * 而这类插件又不属于 profile 的组合包，因此只有这里替它建链接才解析得到。
 *
 * 两处都要建：预设发现的 harnessBase 锚定在 profile 目录，而 harness 自身的
 * 安装锚点在仓库根；只挂一处时，另一处会报 "rows name plugins that cannot be
 * resolved"。幂等：目标已指向同一目录时跳过。
 */
function mountPresetPlugins() {
  const retired = readRetired()
  for (const dirName of readdirSync(packagesDir).sort()) {
    const dir = join(packagesDir, dirName)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (typeof manifest.name !== 'string' || manifest.dsh?.bundle?.patch !== undefined) continue
    if (retired.includes(manifest.name)) continue
    for (const target of [
      join(repoRoot, 'node_modules', manifest.name),
      join(profileDir, 'node_modules', manifest.name),
    ]) {
      try {
        if (lstatSync(target).isSymbolicLink()) unlinkSync(target)
        else rmSync(target, { recursive: true, force: true })
      } catch {
        // 目标不存在则忽略。
      }
      mkdirSync(dirname(target), { recursive: true })
      symlinkSync(dir, target, 'junction')
    }
    console.log(`[dev] 预设插件 junction 挂载 ${manifest.name} → ${dir}`)
  }
}

/**
 * 仓库内提供、但未发布到 npm 的可选能力包。
 *
 * agent 浏览器/电脑自动化在 web profile 的 patch 里按包名引用，而这些包只存在于
 * 源码 checkout（根 package.json 的 devDependencies），既不在 profile 的依赖里，
 * 也不进共享 fallback，只能在这里 junction 进 profile 才解析得到。缺包不阻断启动。
 */
const WORKSPACE_CAPABILITY_PACKAGES = [
  'packages/browser-use/browser-use',
  'packages/experimental/browser-use-runtime',
  'packages/experimental/browser-use-playwright-mcp',
  'packages/computer-use/computer-use',
  'packages/experimental/computer-use-cua-driver-native',
]

/** 把上列能力包 junction 进 profile 的 node_modules。 */
function mountWorkspaceCapabilities() {
  for (const relative of WORKSPACE_CAPABILITY_PACKAGES) {
    const dir = join(repoRoot, relative)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) {
      console.log(`[dev] 跳过缺失的能力包 ${relative}`)
      continue
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (typeof manifest.name !== 'string') continue
    const target = join(profileDir, 'node_modules', manifest.name)
    try {
      if (lstatSync(target).isSymbolicLink()) unlinkSync(target)
      else rmSync(target, { recursive: true, force: true })
    } catch {
      // 目标不存在则忽略。
    }
    mkdirSync(dirname(target), { recursive: true })
    symlinkSync(dir, target, 'junction')
    console.log(`[dev] 能力包 junction 挂载 ${manifest.name}`)
  }
}

/**
 * 纯 JS 自研插件所需的宿主运行时包。
 *
 * 这类插件没有构建步骤，运行时由 Node 直接 import 宿主包（browser-panel 需要
 * @deepseek-ai/dsh-tools 的 defineTool）。模块解析发生在插件源码目录，所以链接必须建在
 * 社区 workspace 的 node_modules 里；目标只能是本仓库源码包——npm 上的同名包可能是另一
 * 代（上游 README 记录过 dsh-tools 与 harness 错配会让整个 profile 起不来）。
 */
const PLUGIN_HOST_DEP_PATHS = {
  '@deepseek-ai/dsh-tools': 'packages/core/tools',
}

function mountPluginHostDeps() {
  for (const [depName, relative] of Object.entries(PLUGIN_HOST_DEP_PATHS)) {
    const dir = join(repoRoot, relative)
    if (!existsSync(join(dir, 'package.json'))) {
      console.log(`[dev] 跳过缺失的宿主依赖 ${depName}（${relative}）`)
      continue
    }
    // 两处都要挂：插件从源码目录解析（社区 workspace 的 node_modules），而 Loader 若按
    // 链接路径解析则会落到 profile 的 node_modules。与 mountPresetPlugins 同理，只挂一处
    // 会在另一处报 cannot be resolved。
    for (const base of [join(here, 'node_modules'), join(profileDir, 'node_modules')]) {
      const target = join(base, depName)
      try {
        if (lstatSync(target).isSymbolicLink()) unlinkSync(target)
        else rmSync(target, { recursive: true, force: true })
      } catch {
        // 目标不存在则忽略。
      }
      mkdirSync(dirname(target), { recursive: true })
      symlinkSync(dir, target, 'junction')
    }
    console.log(`[dev] 宿主依赖 junction ${depName} → ${relative}（社区 workspace + profile）`)
  }
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
    // 作用域包（如 @scope/name）的父目录在全新 profile 上尚不存在，
    // junction 的创建要求目标父目录就位。
    mkdirSync(dirname(target), { recursive: true })
    symlinkSync(plugin.dir, target, 'junction')
    ensureBundle(plugin.name)
  }
  mountPresetPlugins()
  mountWorkspaceCapabilities()
  mountPluginHostDeps()
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
  } else if (existsSync(join(plugin.dir, 'tsconfig.json'))) {
    run(`${plugin.dirName} tsc`, tsc, ['-p', 'tsconfig.json', '--watch'], plugin.dir)
  } else {
    // 纯 JS 插件（如 browser-panel）没有编译步骤：源码本身就是运行时产物，由 Host
    // 侧的 Cordis HMR 直接热替换；起一个 tsc watch 只会立刻失败，并因下面的退出处理
    // 把整条 dev 链一起拖停。
    console.log(`[dev] ${plugin.dirName} 无构建配置（纯 JS 插件），跳过 watch`)
  }
}

const stop = () => {
  for (const stage of stages) stage.kill()
  process.exit(0)
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

console.log(`[dev] 已启动 ${plugins.length} 个自研插件的 watch，修改源码即可热替换（Ctrl+C 结束）`)
