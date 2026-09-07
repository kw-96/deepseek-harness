import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const archive = resolve(process.argv[2] ?? '')
const flavor = process.argv[3]
if (process.argv[2] === undefined) throw new Error('usage: node scripts/verify-package.mjs <package.tgz>')
const flavors = ['manager', 'marketplace', 'codex-shell', 'workorder-agent']
if (!flavors.includes(flavor)) throw new Error(`package flavor must be one of ${flavors.join(', ')}`)
const packageNames = {
  manager: 'dsh-plugin-manager',
  marketplace: '@ruihuahe/dsh-plugin-marketplace',
  'codex-shell': 'dsh-codex-shell',
  'workorder-agent': 'workorder-agent',
}
const entryFiles = {
  manager: ['client.js', 'index.js', 'remote.js'],
  marketplace: ['client.js', 'index.js', 'remote.js'],
  'codex-shell': ['client.js', 'index.js', 'remote.js'],
  'workorder-agent': ['harness/host.js'],
}

const directory = await mkdtemp(join(tmpdir(), 'dsh-plugin-manager-pack-'))
try {
  const unpack = spawnSync('tar', ['-xzf', archive, '-C', directory], { encoding: 'utf8' })
  if (unpack.status !== 0) throw new Error(unpack.stderr || `tar exited with ${unpack.status}`)
  const packageRoot = join(directory, 'package')
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  if (manifest.name !== packageNames[flavor]) throw new Error(`unexpected package name ${manifest.name}`)
  if (typeof manifest.dsh?.bundle?.patch !== 'string') throw new Error('package does not declare dsh.bundle')
  await Promise.all(entryFiles[flavor].map(file => readFile(join(packageRoot, 'lib', file))))
  const requiredDocs = flavor === 'workorder-agent'
    ? ['cordis.patch.yml', 'README.md', 'README.zh-CN.md']
    : ['cordis.patch.yml', 'README.md', 'README.zh-CN.md', 'LICENSE']
  await Promise.all(requiredDocs.map(file => readFile(join(packageRoot, file))))
  const pending = entryFiles[flavor].map(file => join(packageRoot, 'lib', file))
  const visited = new Set()
  while (pending.length > 0) {
    const filename = pending.pop()
    if (filename === undefined || visited.has(filename)) continue
    visited.add(filename)
    const source = await readFile(filename, 'utf8')
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      const imported = resolve(dirname(filename), match[1])
      await readFile(imported)
      if (imported.endsWith('.js')) pending.push(imported)
    }
  }
  console.log(`verified ${manifest.name} and ${visited.size} runtime modules in ${relative(process.cwd(), archive)}`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
