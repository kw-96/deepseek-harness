import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../../..')
const svgPath = join(repoRoot, 'apps/web/public/favicon.svg')
const outDir = join(here, '../src-tauri/icons')
mkdirSync(outDir, { recursive: true })

const raw = readFileSync(svgPath, 'utf8')
// Drop dark-mode CSS (resvg does not evaluate media queries) and keep the black mark.
const normalized = raw
  .replace(/<style>[\s\S]*?<\/style>\s*/u, '')
  .replace(/fill="#000"/gu, 'fill="#111111"')

for (const size of [32, 128, 256, 512, 1024]) {
  const resvg = new Resvg(normalized, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(255,255,255,0)',
  })
  const png = Buffer.from(resvg.render().asPng())
  if (size === 32) writeFileSync(join(outDir, '32x32.png'), png)
  if (size === 128) writeFileSync(join(outDir, '128x128.png'), png)
  if (size === 256) writeFileSync(join(outDir, '128x128@2x.png'), png)
  if (size === 1024) writeFileSync(join(outDir, 'icon.png'), png)
  console.log(`wrote size=${size} bytes=${png.length}`)
}
