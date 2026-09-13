#!/usr/bin/env node
/**
 * Pack this host's working DeepSeek Harness deployment into one archive that a
 * same-architecture Windows host can run:
 *
 *   node community/portable.mjs check                 # is this host packable?
 *   node community/portable.mjs pack                  # write the archive
 *   node community/portable.mjs pack --dry-run        # report sizes only
 *
 * The archive carries the checkout with its build output (`apps/web/dist` and
 * every `lib/`), the profile with its installed plugin packages, the skills,
 * and a launcher that points `DSH_HOME` at the packaged copy. A target host
 * therefore skips `pnpm run build` and every plugin configuration step.
 *
 * The checkout's own `node_modules` is deliberately not carried: it holds
 * thousands of Windows junctions, and neither `tar` nor `fs.cp` archives a
 * junction faithfully — each target is stored again instead of linked, which
 * multiplies the archive. Target hosts run `pnpm install` once.
 * `$DSH_HOME/profiles/node_modules` is left out for the same reason, and
 * because profile boot rebuilds it from the installation on every start.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, arch, platform } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', 'web')

/** Private or regenerable entries never copied out of a personal home. */
const HOME_EXCLUDES = [
  'sessions', 'cache', 'storages', 'runtimes', 'marketplace', 'ocr', 'desktop',
  '.credentials.yaml', '.anonymous-user-id', 'profiles/node_modules',
]

/** Build residue and VCS metadata; `--with-git` keeps the repository. */
const REPO_EXCLUDES = ['node_modules', '.git', '.desktop-build', '.portable-staging']

/**
 * Report whether this host has everything a portable archive must contain.
 * @returns true when the archive would be runnable on the target host.
 */
function checkHost() {
  const required = [
    ['仓库依赖 node_modules', join(repoRoot, 'node_modules')],
    ['前端构建产物 apps/web/dist', join(repoRoot, 'apps', 'web', 'dist', 'index.html')],
    ['profile 清单', join(profileDir, 'package.json')],
    ['profile 依赖 node_modules', join(profileDir, 'node_modules')],
  ]
  let ready = true
  for (const [label, path] of required) {
    const present = existsSync(path)
    if (!present) ready = false
    console.log(`${present ? '[通过]' : '[缺失]'} ${label}`)
  }
  if (!ready) console.log('先在这台机器上跑完 pnpm install、pnpm run build 和一次 pnpm dsh web 再来打包')
  return ready
}

/**
 * Sum the apparent size of a directory, without following junctions.
 * @param dir - absolute directory to measure.
 * @returns the total apparent bytes, or 0 when it cannot be measured.
 */
function apparentSize(dir) {
  if (!existsSync(dir)) return 0
  const result = spawnSync('powershell', ['-NoProfile', '-Command',
    `(Get-ChildItem -LiteralPath '${dir}' -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum`,
  ], { encoding: 'utf8' })
  return Number(result.stdout?.trim()) || 0
}

/**
 * Format a byte count for the Chinese progress output.
 * @param bytes - the size to format.
 * @returns a human-readable size in MB or GB.
 */
function formatSize(bytes) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

/**
 * Test whether a path inside a copied tree is excluded.
 * @param rel - the path relative to the copy root, forward slashes.
 * @param excludes - relative paths to drop, matched exactly or by prefix.
 * @returns true when the path must not be copied.
 */
function excluded(rel, excludes) {
  return excludes.some(entry => rel === entry || rel.startsWith(`${entry}/`) || rel.split('/').includes(entry))
}

/**
 * Write the launcher a target host runs after extracting the archive.
 * @param dir - the staged package directory.
 */
async function writeLauncher(dir) {
  await writeFile(join(dir, 'start.cmd'), [
    '@echo off',
    'setlocal',
    'set "HERE=%~dp0"',
    'rem 便携模式：会话与设置都留在这个文件夹里，不碰目标机的用户目录',
    'set "DSH_HOME=%HERE%dsh-home"',
    '',
    'if not exist "%HERE%repo\\node_modules" (',
    '  echo [便携包] 首次运行，安装依赖中，请稍候...',
    '  pushd "%HERE%repo"',
    '  call pnpm install --frozen-lockfile',
    '  popd',
    ')',
    '',
    'cd /d "%HERE%repo"',
    'node community\\seed.mjs',
    'node --import tsx/esm apps/cli/src/bin.ts web %*',
    '',
  ].join('\r\n'), 'utf8')
}

/**
 * Write the usage note shipped inside the archive.
 * @param dir - the staged package directory.
 * @param manifest - the manifest recorded beside the note.
 */
async function writeReadme(dir, manifest) {
  await writeFile(join(dir, '便携包说明.md'), `# DeepSeek Harness 便携包

来源主机架构：${manifest.arch}　打包时间：${manifest.packedAt}

## 目标主机上怎么用

1. 解压到任意目录。
2. 装 Node.js 24：\`winget install OpenJS.NodeJS.LTS\`（装完重开终端）。
3. 双击 \`start.cmd\`。

首次启动会自动 \`pnpm install\` 一次下载依赖并装好 profile，之后再启动就是直接起服务。

## 这个包省掉了什么

- **不需要 \`pnpm run build\`** —— 前端产物与所有 \`lib/\` 构建输出已经带上。
- **不需要重新配置插件** —— profile 清单、已安装的插件包、技能、全局 AGENTS.md 全都在包里。
- **不会污染目标机** —— 会话与设置写在包内的 \`dsh-home\`，不动 \`%USERPROFILE%\\.dsh\`。
  想让它接管默认家目录，删掉 \`start.cmd\` 里设置 \`DSH_HOME\` 的那一行。

## 注意事项

- **只能在同架构主机之间使用**：${manifest.arch} 的包只能给 ${manifest.arch} 的 Windows 用。依赖里有平台相关的原生二进制，跨架构会直接崩。
- 包里**不含**凭据（\`.credentials.yaml\`）、会话记录、缓存与 marketplace 数据，这些要在目标机上重新配。
- 换目录或换机器后，\`seed.mjs\` 会自动把 profile 里写死的 tarball 路径改到新位置，并摘掉本机装不上的插件。
- 目标机需要能访问 npm 源（国内建议先 \`npm config set registry https://registry.npmmirror.com\`）。
`, 'utf8')
}

/**
 * Stage the archive contents, compress them, and report the result.
 * @param options - the parsed command line.
 * @returns the staged package directory, or undefined when nothing was staged.
 */
async function pack(options) {
  if (!checkHost()) return undefined
  const stagingRoot = join(options.outDir, '.portable-staging')
  const name = `dsh-portable-${arch()}-${new Date().toISOString().slice(0, 10)}`
  const stage = join(stagingRoot, name)
  const manifest = {
    arch: arch(),
    platform: platform(),
    node: process.version,
    packedAt: new Date().toISOString(),
    withGit: options.withGit,
  }

  if (options.dryRun) {
    console.log('\n打包计划（--dry-run，不写入任何文件）')
    console.log(`  仓库源码与构建产物  ${formatSize(apparentSize(repoRoot))}（不含 node_modules）`)
    console.log(`  profile 与技能      ${formatSize(apparentSize(profileDir))}`)
    console.log(`  产物                ${join(options.outDir, `${name}.tar.gz`)}`)
    return undefined
  }

  const repoExcludes = [...REPO_EXCLUDES, ...(options.withGit ? ['.git'] : [])]
  await mkdir(stage, { recursive: true })
  console.log(`[便携包] 暂存到 ${stage}`)
  await cp(repoRoot, join(stage, 'repo'), {
    recursive: true,
    dereference: true,
    filter: source => !excluded(source.slice(repoRoot.length + 1).replaceAll('\\', '/'), repoExcludes),
  })
  console.log('[便携包] 仓库已复制')
  await cp(dshHome, join(stage, 'dsh-home'), {
    recursive: true,
    dereference: true,
    filter: (source) => {
      const rel = source.slice(dshHome.length + 1).replaceAll('\\', '/')
      if (rel.startsWith('profiles/') && rel.includes('.bak-')) return false
      return !excluded(rel, HOME_EXCLUDES)
    },
  })
  console.log('[便携包] profile 与技能已复制')

  await writeLauncher(stage)
  await writeReadme(stage, manifest)
  await writeFile(join(stage, 'portable-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const archive = join(options.outDir, `${name}.tar.gz`)
  await mkdir(options.outDir, { recursive: true })
  console.log('[便携包] 正在压缩...')
  const tarred = spawnSync(`tar -czf "${archive}" -C "${stagingRoot}" ${name}`, { stdio: 'inherit', shell: true })
  if (tarred.status !== 0) {
    console.error('[便携包] 压缩失败')
    return undefined
  }
  console.log(`\n[便携包] 完成 → ${archive}（${formatSize((await stat(archive)).size)}）\n        拷到同架构的 Windows 主机解压，双击 start.cmd 即可`)
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
