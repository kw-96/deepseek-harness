import { describe, expect, it } from 'vitest'
import { grepPathspecs, pathAllowed, splitGlobs } from '../src/host/globs.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const styles = readFileSync(resolve(process.cwd(), 'src/client/styles.module.css'), 'utf8')

describe('codex-shell file search globs', () => {
  it('splits comma-separated include/exclude patterns', () => {
    expect(splitGlobs('*.ts, src/**')).toEqual(['*.ts', 'src/**'])
    expect(splitGlobs('  ')).toEqual([])
  })

  it('allows and excludes relative paths against VS Code-style globs', () => {
    expect(pathAllowed('src/a.ts', '*.ts', undefined)).toBe(true)
    expect(pathAllowed('src/a.ts', 'src/**', undefined)).toBe(true)
    expect(pathAllowed('src/a.ts', undefined, 'src/**')).toBe(false)
    expect(pathAllowed('readme.md', '*.ts', undefined)).toBe(false)
  })

  it('builds git grep pathspecs with exclude magic', () => {
    expect(grepPathspecs(undefined, undefined)).toEqual(['.'])
    expect(grepPathspecs('*.ts', 'dist/**')).toEqual(['*.ts', ':(exclude)dist/**'])
  })
})

describe('codex-shell files panel scroll', () => {
  it('gives the files list a flex scroll seat', () => {
    expect(styles).toMatch(/\.filesRoot\s*\{[^}]*overflow:\s*hidden;/s)
    expect(styles).toMatch(/\.filesScroll\s*\{[^}]*overflow-y:\s*auto;/s)
    expect(styles).toMatch(/\.panelBody\s*\{[^}]*overflow:\s*hidden;/s)
    expect(styles).toMatch(/\.panel\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;/s)
  })
})
