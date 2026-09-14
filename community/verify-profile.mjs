#!/usr/bin/env node
/**
 * profile 组合静态自检：不启动 dsh，就能发现「装完插件、下次启动才炸」的问题。
 *
 *   node community/verify-profile.mjs [--strict] [--profile <name>]
 *
 * 检查三件事：
 *   1. 每个 bundle 都在 profile 的 node_modules 里可解析；
 *   2. 每个 bundle 声明的 patch 文件存在且是合法 YAML（`!!js` 是仓库合法用法，先摘掉）；
 *   3. 所有 insert 行的 id 全局唯一，行名可解析（cordis 伪名与仓库工作区包分别放行）。
 *
 * 重复行 id 是硬失败（组合会加载不出来）；行名不可解析默认只告警，加 --strict 转为失败。
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import yaml from 'js-yaml'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const strict = args.includes('--strict')
const profileName = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'web'
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', profileName)
// 行名有两个合法解析根：profile 自己的 node_modules（插件依赖），以及仓库的
// node_modules（bundle 引用的工作区包）。
const profileRequire = createRequire(join(profileDir, 'package.json'))
const repoRequire = createRequire(join(repoRoot, 'package.json'))

/** 输出一行结果。 */
function line(text) {
  console.log(text)
}

/**
 * 用给定解析根找包目录。
 * @param name 包名
 * @param extraRoots 额外解析根（bundle 目录），bundle 引用的包常在自己的依赖树里
 * @returns 包根目录，找不到时 undefined
 */
function findPackage(name, extraRoots = []) {
  const loaders = [profileRequire, repoRequire, ...extraRoots.map(root => createRequire(join(root, 'package.json')))]
  for (const loader of loaders) {
    try {
      // 部分包不暴露 ./package.json 子路径，故以入口文件反推包根。
      const entry = loader.resolve(name)
      let dir = dirname(entry)
      while (dir !== dirname(dir)) {
        if (existsSync(join(dir, 'package.json'))) return dir
        dir = dirname(dir)
      }
    } catch {
      // 换下一个解析根。
    }
  }
  return undefined
}

/** cordis 伪名（分组/钩子等）不指向 npm 包。 */
function isPseudoName(name) {
  return name.includes(':')
}

const manifestPath = join(profileDir, 'package.json')
if (!existsSync(manifestPath)) {
  line(`找不到 profile 清单：${manifestPath}`)
  process.exit(2)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const bundles = manifest.dsh?.profile?.bundles ?? []
const rowIds = new Map()
// 原文正则兜底收集到的 id：只用于「悬空行」判定，不参与重复 id 判定。
const mentionedIds = new Set()
const hardProblems = []
const warnings = []
let rowCount = 0

for (const bundle of bundles) {
  const root = findPackage(bundle)
  if (root === undefined) {
    hardProblems.push(`bundle ${bundle} 在 profile 与仓库的 node_modules 里都解析不到`)
    continue
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const patchRel = pkg.dsh?.bundle?.patch
  if (patchRel === undefined) continue
  const patchPath = join(root, patchRel)
  if (!existsSync(patchPath)) {
    hardProblems.push(`${bundle} 声明了 ${patchRel}，但文件不存在`)
    continue
  }
  // !!js 是仓库合法的 cordis.yml 用法；先摘掉标签再解析，本检查只关心行 id 与行名。
  const text = readFileSync(patchPath, 'utf8').replace(/!!js\s+/g, '')
  // 条件式插入（!!js）摘掉标签后结构会变，YAML 收集可能不全；再用原文正则兜底，
  // 让已知 id 集合偏大——本检查只在「任何 bundle 都没提到过这个 id」时才告警。
  for (const match of text.matchAll(/(?:^|\s)id:\s*['"]?([A-Za-z0-9._@/-]+)/g)) {
    const mentioned = match[1]
    if (mentioned !== undefined) mentionedIds.add(mentioned)
  }
  let document
  try {
    document = yaml.load(text)
  } catch (error) {
    hardProblems.push(`${bundle} 的 ${patchRel} 解析失败：${String(error).slice(0, 100)}`)
    continue
  }
  for (const entry of Array.isArray(document) ? document : []) {
    for (const inserted of entry?.insert ?? []) {
      if (inserted?.id === undefined) continue
      rowCount += 1
      if (rowIds.has(inserted.id)) {
        hardProblems.push(`插入行 id 冲突："${inserted.id}" 同时来自 ${rowIds.get(inserted.id)} 与 ${bundle}`)
      }
      rowIds.set(inserted.id, bundle)
      if (typeof inserted.name === 'string' && !isPseudoName(inserted.name) && findPackage(inserted.name, [root]) === undefined) {
        warnings.push(`插入行 ${inserted.id} 的包名 ${inserted.name} 解析不到（来自 ${bundle}）`)
      }
    }
  }
}

// 第二阶段：profile 自己的 patch 层。顶层操作里带 `id` 的条目是在「改写某个已存在的
// 行」；若没有任何 bundle（或本文件自己的 insert）插入过那个 id，加载器只会打一行
// 「entry not found」警告——插件静默缺失，这就是 dsh-plugin-manager 目录里有、但
// 依赖树里没有的那种漂移。
const patchFiles = ['cordis.patch.yml', 'cordis.yml']
  .map(name => join(profileDir, name))
  .filter(existsSync)
for (const patchPath of patchFiles) {
  const text = readFileSync(patchPath, 'utf8').replace(/!!js\s+/g, '')
  let document
  try {
    document = yaml.load(text)
  } catch (error) {
    warnings.push(`${patchPath} 解析失败：${String(error).slice(0, 100)}`)
    continue
  }
  const entries = Array.isArray(document) ? document : []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    for (const inserted of entry.insert ?? []) {
      if (inserted?.id !== undefined && !rowIds.has(inserted.id)) rowIds.set(inserted.id, 'profile patch 自身')
    }
  }
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || entry.insert !== undefined) continue
    if (typeof entry.id !== 'string' || rowIds.has(entry.id) || mentionedIds.has(entry.id)) continue
    warnings.push(`profile patch 改写了不存在的行 "${entry.id}"：没有任何 bundle 插入它，加载器只警告，该插件实际处于缺失状态`)
  }
}

line(`profile    ${profileDir}`)
line(`bundle     ${bundles.length} 个，插入行 ${rowCount} 条，id 唯一性检查完成`)
for (const warning of warnings) line(`[告警] ${warning}`)
for (const problem of hardProblems) line(`[失败] ${problem}`)

if (hardProblems.length > 0 || (strict && warnings.length > 0)) {
  line('结论：组合存在问题，直接启动会失败或静默丢插件。')
  process.exit(1)
}
line(`结论：组合自检通过${warnings.length > 0 ? '（有告警，见上）' : ''}。`)
