/**
 * Write what a target host runs: `dsh.cmd` (the file the desktop shell walks up
 * to), `start.cmd`, the boot program both share, the shipped notes, and the two
 * freshness markers the desktop shell reads before it decides to rebuild or
 * reinstall anything.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BUNDLED_NODE_VERSION, BUNDLED_PNPM_VERSION, nodeRuntimeDirName } from './host.mjs'
import { STORE_DIR_NAME } from './store.mjs'

/** Boot program text; runs under the bundled Node.js inside the package. */
function bootProgram(archName) {
  return `import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtime = join(pkgRoot, '.runtime')
const nodeExe = join(runtime, ${JSON.stringify(nodeRuntimeDirName(archName))}, 'node.exe')
const pnpmEntry = join(runtime, 'pnpm', 'bin', 'pnpm.cjs')
const store = join(pkgRoot, ${JSON.stringify(STORE_DIR_NAME)})
const marker = join(pkgRoot, '.portable-installed.json')
const dshHome = process.env.DSH_HOME ?? join(pkgRoot, 'dsh-home')
const profile = join(dshHome, 'profiles', 'web')

function run(args, cwd, label) {
  process.stdout.write(\`[便携包] \${label}\\n\`)
  const child = spawnSync(nodeExe, [pnpmEntry, \`--config.store-dir=\${store}\`, '--config.enable-global-virtual-store=false', ...args], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, DSH_HOME: dshHome, PATH: \`\${dirname(nodeExe)};\${process.env.PATH ?? ''}\` },
  })
  if (child.status !== 0) {
    process.stderr.write(\`[便携包] \${label} 失败（退出码 \${child.status}）\\n\`)
    process.exit(child.status ?? 1)
  }
}

if (!existsSync(marker)) {
  // 包内只随包带了 node_modules/.modules.yaml 占位（供桌面壳判断无需构建），
  // 真正的依赖树在这里离线安装，全部读同一份随包的 store。
  // profile 已在打包时生成好并改成相对路径，因此这里不再跑 seed，
  // 否则它会把 tarball 依赖改写成目标机绝对路径、与锁定文件失配。
  if (!existsSync(join(pkgRoot, 'node_modules', '@deepseek-ai'))) {
    run(['install', '--prod', '--offline', '--frozen-lockfile', '--trust-lockfile'], pkgRoot, '首次运行：离线安装运行依赖')
  }
  if (!existsSync(join(profile, 'node_modules'))) {
    run(['install', '--offline', '--frozen-lockfile', '--trust-lockfile'], profile, '首次运行：离线安装插件')
  }
  writeFileSync(marker, \`\${JSON.stringify({ schemaVersion: 1, installedAt: new Date().toISOString() })}\\n\`)
}

const cli = join(pkgRoot, 'apps', 'cli', 'lib', 'bin.js')
if (!existsSync(cli)) {
  process.stderr.write(\`[便携包] 缺少 CLI 构建产物：\${cli}\\n\`)
  process.exit(1)
}
mkdirSync(dshHome, { recursive: true })
const child = spawnSync(nodeExe, [cli, ...process.argv.slice(2)], {
  cwd: pkgRoot,
  stdio: 'inherit',
  env: { ...process.env, DSH_HOME: dshHome, PATH: \`\${dirname(nodeExe)};\${process.env.PATH ?? ''}\` },
})
process.exit(child.status ?? 0)
`
}

/**
 * Write the launchers, the boot program, and the shipped notes.
 * @param options - `{ stage, archName, manifest }`.
 */
export function writeLauncher({ stage, archName, manifest }) {
  const root = resolve(stage)
  mkdirSync(join(root, 'boot'), { recursive: true })
  writeFileSync(join(root, 'boot', 'portable-boot.mjs'), bootProgram(archName), 'utf8')

  // The desktop shell walks up from its own path for this exact name.
  writeFileSync(join(root, 'dsh.cmd'), [
    '@echo off',
    'setlocal',
    'set "HERE=%~dp0"',
    `set "NODE=%HERE%.runtime\\${nodeRuntimeDirName(archName)}\\node.exe"`,
    'if not exist "%NODE%" ( echo [便携包] 找不到内置 Node：%NODE% & exit /b 1 )',
    'rem 便携包固定使用包内的 Harness 家目录，避免继承到目标机已存在的 DSH_HOME；',
    'rem 想改用系统默认家目录，先 set DSH_PORTABLE_SHARED_HOME=1。',
    'if not "%DSH_PORTABLE_SHARED_HOME%"=="1" set "DSH_HOME=%HERE%dsh-home"',
    'set "PATH=%HERE%.runtime\\' + nodeRuntimeDirName(archName) + ';%PATH%"',
    '"%NODE%" "%HERE%boot\\portable-boot.mjs" %*',
    'exit /b %ERRORLEVEL%',
    '',
  ].join('\r\n'), 'utf8')

  writeFileSync(join(root, 'start.cmd'), [
    '@echo off',
    'setlocal',
    'set "HERE=%~dp0"',
    'rem 便携模式：会话、设置、插件状态都留在这个文件夹里，不碰目标机的用户目录',
    'if exist "%HERE%DeepSeek Harness.exe" (',
    '  start "" "%HERE%DeepSeek Harness.exe"',
    '  exit /b 0',
    ')',
    'call "%HERE%dsh.cmd" web %*',
    '',
  ].join('\r\n'), 'utf8')

  writeFileSync(join(root, '便携包说明.md'), readme(archName, manifest), 'utf8')
  writeFileSync(join(root, 'portable-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/**
 * Satisfy the desktop shell's freshness checks, which only compare mtimes: the
 * shipped `apps/web/dist` must look newer than every build input, and the
 * dependency marker newer than the lockfile. The real install happens in
 * `boot/portable-boot.mjs` before the server starts.
 * @param stage - the staged package directory.
 */
export function writeFreshnessMarkers(stage) {
  const root = resolve(stage)
  // 略未来：宁可让壳认为“已是最新”，它与包内其余时间戳的先后关系必须稳定，
  // 不能依赖打包耗时。
  const future = new Date(Date.now() + 60 * 60 * 1000)
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  const marker = join(root, 'node_modules', '.modules.yaml')
  writeFileSync(marker, '# 便携包占位：真正的离线安装由 boot/portable-boot.mjs 完成\n', 'utf8')
  utimesSync(marker, future, future)
  const index = join(root, 'apps', 'web', 'dist', 'index.html')
  utimesSync(index, future, future)
}

/**
 * The Chinese notes shipped beside the launchers.
 * @param archName - packed architecture.
 * @param manifest - the recorded package manifest.
 * @returns the notes as Markdown.
 */
function readme(archName, manifest) {
  const archLabel = archName === 'arm64' ? 'ARM64' : 'x64'
  return `# DeepSeek Harness 便携包

来源架构：${archLabel}　打包时间：${manifest.packedAt}　Node ${BUNDLED_NODE_VERSION}　pnpm ${BUNDLED_PNPM_VERSION}

## 目标主机怎么用

1. 解压到任意目录（路径不要有中文以外的特殊符号）。
2. 双击 \`DeepSeek Harness.exe\`（推荐）或 \`start.cmd\`。

目标主机**不需要**预装 Node.js、pnpm 或任何运行时，**不需要**联网，**不需要**再装插件或再配置一遍。

## 包里已经带了什么

- **内置运行时** —— Node.js 与 pnpm 都在 \`.runtime\` 里，只用包内的，不碰系统环境。
- **离线依赖** —— 仓库与 profile 的依赖闭包已固化在 \`.pnpm-store\`，首次启动自动离线安装，不访问 npm 源。
- **插件已预置** —— profile 清单、社区插件、技能、全局 AGENTS.md 都在包内，首次启动直接生效。
- **配置已预置** —— 非敏感设置随包携带；模型凭据不在包内，需在界面里填一次。

## 注意

- **只能在同架构主机之间使用**：${archLabel} 的包只能给 ${archLabel} 的 Windows 用。依赖里有平台相关二进制，跨架构会直接崩。
- 端口固定为 \`127.0.0.1:3080\`；被占用时可在 \`dsh.cmd web --port <端口>\` 里换。
- 会话、缓存、凭据写在包内的 \`dsh-home\`，**即使目标机已有 \`DSH_HOME\` 也强制使用包内目录**，不污染目标机；想改用系统默认家目录，先设 \`DSH_PORTABLE_SHARED_HOME=1\`。
- 移动目录后如果启动异常，删除包内 \`.portable-installed.json\` 再启动一次，会重新离线安装。
`
}
