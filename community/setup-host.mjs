#!/usr/bin/env node
/**
 * 新主机装配入口：把仓库已有的装配件（preflight / doctor / seed / portable）
 * 串成一条幂等命令，并在装配失败之前把已知陷阱直接点出来。
 *
 *   node community/setup-host.mjs            # 默认等同 check
 *   node community/setup-host.mjs check      # 只体检：不改动任何东西
 *   node community/setup-host.mjs install    # 装配：安装依赖 → 构建 → 写 profile → 自检
 *   node community/setup-host.mjs pack       # 打便携包（同一架构主机免构建部署）
 *
 * 本脚本不重复实现装配逻辑：它按顺序调用仓库自己的脚本，并在中间插入
 * 「本会话踩过的坑」检查——这些坑的共同特征是失败信息离根因很远。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', 'web')
const mode = process.argv[2] ?? 'check'

/** 打印一段小节标题。 */
function section(title) {
  console.log(`\n===== ${title} =====`)
}

/** 读取文本文件，不存在时返回空串。 */
function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * 执行一条命令并把输出直接接到本进程。
 * @param command 可执行文件
 * @param args 参数
 * @returns 退出码
 */
function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32' })
  return result.status ?? 1
}

/** 静默执行并返回 stdout（用于读版本号）。 */
function capture(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32' })
  return (result.stdout ?? '').trim()
}

const problems = []

/**
 * 已知陷阱检查：profile 的 pnpm store 大版本与当前 pnpm 不一致时，
 * profile 安装会抛 ERR_PNPM_UNEXPECTED_STORE，而报错离根因很远。
 */
function checkPnpmStore() {
  const modulesYaml = readText(join(profileDir, 'node_modules', '.modules.yaml'))
  const recorded = /storeDir:.*?store[\\/]v(\d+)/.exec(modulesYaml)?.[1]
  const current = /^(\d+)\./.exec(capture('pnpm', ['--version']))?.[1]
  if (recorded === undefined || current === undefined) return
  if (recorded === current) {
    console.log(`[通过] profile store 与 pnpm 大版本一致（v${current}）`)
    return
  }
  problems.push(
    `profile 由 pnpm v${recorded} 安装，当前 pnpm 是 v${current}：直接装插件会报 ERR_PNPM_UNEXPECTED_STORE。\n`
    + `         修法：在 profile 目录用 v${recorded} 装，或先 cd "${profileDir}" && pnpm install 整体重链（后者会重建全部依赖，先备份）。`,
  )
}

/**
 * 已知陷阱检查：profile 依赖里出现 github: 引用时，pnpm 会拦下构建脚本；
 * 缺 allowBuilds 的条目会在安装时报错并要求手工补 key。
 */
function checkHostedBuilds() {
  const manifest = readText(join(profileDir, 'package.json'))
  const hosted = [...manifest.matchAll(/"(?:github|git\+https?):[^"]*"/g)].map(match => match[0])
  if (hosted.length === 0) return
  const allowBuilds = readText(join(profileDir, 'pnpm-workspace.yaml')).includes('allowBuilds')
  if (allowBuilds) {
    console.log(`[通过] profile 有 ${hosted.length} 个 git 依赖且已声明 allowBuilds`)
    return
  }
  problems.push(
    `profile 有 ${hosted.length} 个 git 依赖，但 pnpm-workspace.yaml 没有 allowBuilds 条目：安装会被拦下。\n`
    + '         修法：按 pnpm 报出的 key 形式补进 allowBuilds，再重跑安装。',
  )
}

/** 提示不需要检查、但每次装配都值得知道的两件事。 */
function printHints() {
  const savepoint = join(profileDir, 'node_modules', 'dsh-undo-savepoint', 'tools', 'dsh-undo.ps1')
  if (existsSync(savepoint)) {
    console.log('[提示] 已装 dsh-undo-savepoint：升级或改插件前先存快照，出问题可一键回退')
    console.log(`         powershell -File "${savepoint}" snapshot`)
  }
  console.log('[提示] 新增/修改插件的 Remote 方法后必须重启 dsh web：typert manifest 按包名缓存，HMR 不生效')
}

/** check：依次跑仓库自己的三个只读体检件，再跑陷阱检查。 */
function check() {
  section('运行时与可达性（preflight）')
  const preflight = run('node', ['community/preflight.mjs'])
  section('部署自检（doctor）')
  const doctor = run('node', ['community/doctor.mjs'])
  section('便携打包就绪度（portable check）')
  const portable = run('node', ['community/portable.mjs', 'check'])
  section('组合自检（verify-profile）')
  const composition = run('node', ['community/verify-profile.mjs'])
  section('已知陷阱')
  checkPnpmStore()
  checkHostedBuilds()
  printHints()
  section('结论')
  for (const problem of problems) console.log(`[警告] ${problem}`)
  const failed = preflight !== 0 || doctor !== 0 || portable !== 0 || composition !== 0
  if (failed) {
    console.log('体检未通过：按上面第一条失败项给出的修复命令处理后重跑本命令。')
    return 1
  }
  if (problems.length > 0) {
    console.log('体检通过，但有上面列出的警告需要在装插件前处理。')
    return 0
  }
  console.log('体检全部通过。首次装配用 install，已有部署直接跑 pnpm dsh web。')
  return 0
}

/** install：依赖 → 构建 → 写 profile（seed）→ 自检；每一步都是幂等的。 */
function install() {
  section('1/4 安装仓库依赖')
  if (run('pnpm', ['install']) !== 0) return 1
  section('2/4 构建')
  if (run('pnpm', ['run', 'build']) !== 0) return 1
  section('3/4 写 profile（seed）')
  if (run('node', ['community/seed.mjs']) !== 0) return 1
  section('4/4 自检')
  const status = check()
  if (status === 0) {
    console.log('\n装配完成：运行 pnpm dsh web 启动。')
  }
  return status
}

/** pack：调用仓库的便携打包。 */
function pack() {
  section('便携打包')
  console.log('提示：产物在同一架构主机上解压后只需 pnpm install 一次即可 start.cmd 启动。')
  return run('node', ['community/portable.mjs', 'pack'])
}

const handlers = { check, install, pack }
const handler = handlers[mode]
if (handler === undefined) {
  console.error(`未知模式：${mode}（可用：check / install / pack）`)
  process.exit(2)
}
process.exit(handler())
