/**
 * Rasterize apps/web/public/favicon.svg into Tauri icon PNGs.
 *
 * Windows .exe file icons cannot follow light/dark theme the way the SVG
 * `prefers-color-scheme` rule does. Emit a dark rounded tile with a white mark
 * so Explorer stays readable in both themes.
 */
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
const pathMatch = raw.match(/<path\b[^>]*\bd="([^"]+)"/u)
if (pathMatch === null) {
  throw new Error(`rasterize-brand-icon: missing path in ${svgPath}`)
}
const pathD = pathMatch[1]

/**
 * Build one square icon SVG: dark rounded tile + white brand mark with padding.
 * @param size output pixel size
 */
function iconSvg(size) {
  const pad = size * 0.14
  const mark = size - pad * 2
  const radius = Math.round(size * 0.22)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#0F1115"/>
  <g transform="translate(${pad},${pad}) scale(${mark / 50})">
    <path d="${pathD}" fill="#FFFFFF" fill-rule="nonzero"/>
  </g>
</svg>`
}

for (const size of [32, 128, 256, 512, 1024]) {
  const resvg = new Resvg(iconSvg(size), {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  })
  const png = Buffer.from(resvg.render().asPng())
  if (size === 32) writeFileSync(join(outDir, '32x32.png'), png)
  if (size === 128) writeFileSync(join(outDir, '128x128.png'), png)
  if (size === 256) writeFileSync(join(outDir, '128x128@2x.png'), png)
  if (size === 1024) writeFileSync(join(outDir, 'icon.png'), png)
  console.log(`wrote size=${size} bytes=${png.length}`)
}
