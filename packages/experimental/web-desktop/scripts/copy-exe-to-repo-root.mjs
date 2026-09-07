/**
 * Copy the release desktop shell next to the repository root `dsh.cmd`
 * so day-to-day use is a double-click, not a buried `target/release` path.
 */
import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
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
copyFileSync(releaseExe, dest)
for (const legacy of legacyNames) {
  const oldPath = join(repoRoot, legacy)
  if (oldPath !== dest && existsSync(oldPath)) {
    unlinkSync(oldPath)
  }
}
console.log(`copy-exe-to-repo-root: wrote ${dest}`)
