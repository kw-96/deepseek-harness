/**
 * Copy the release desktop shell next to the repository root `dsh.cmd`
 * so day-to-day use is a double-click, not a buried `target/release` path.
 */
import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const builtName = process.platform === 'win32' ? 'dsh-web-desktop.exe' : 'dsh-web-desktop'
const releaseExe = join(packageRoot, 'src-tauri', 'target', 'release', builtName)
const destName = process.platform === 'win32' ? 'DeepSeek Harness.exe' : 'DeepSeek Harness'
const legacyNames = process.platform === 'win32'
  ? ['dsh-web-desktop.exe']
  : ['dsh-web-desktop']

function findRepoRoot(start) {
  let dir = start
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || existsSync(join(dir, 'dsh.cmd'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

if (!existsSync(releaseExe)) {
  console.error(`copy-exe-to-repo-root: missing build output: ${releaseExe}`)
  process.exit(1)
}

const repoRoot = findRepoRoot(packageRoot)
if (repoRoot === null) {
  console.error('copy-exe-to-repo-root: could not locate repository root')
  process.exit(1)
}

const dest = join(repoRoot, destName)
// Delete the previous root exe first when possible so Explorer drops the
// sticky per-path icon cache that otherwise keeps the prior glyph.
if (process.platform === 'win32' && existsSync(dest)) {
  try {
    unlinkSync(dest)
  } catch {
    // 正在运行的 shell 锁住自己的镜像：Windows 允许重命名但不允许删除，所以把
    // 旧文件移进忽略目录 .data/，让新产物落到原路径。运行中的窗口继续使用被
    // 改名的镜像，无需先关闭它。
    const backupDir = join(repoRoot, '.data')
    mkdirSync(backupDir, { recursive: true })
    renameSync(dest, join(backupDir, `${destName}.${Date.now()}.old`))
  }
}
copyFileSync(releaseExe, dest)
for (const legacy of legacyNames) {
  const oldPath = join(repoRoot, legacy)
  if (oldPath !== dest && existsSync(oldPath)) {
    unlinkSync(oldPath)
  }
}
if (process.platform === 'win32') {
  spawnSync('ie4uinit.exe', ['-show'], { stdio: 'ignore', windowsHide: true })
}
console.log(`copy-exe-to-repo-root: wrote ${dest}`)
