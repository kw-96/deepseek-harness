import { describe, expect, it } from 'vitest'
import { parsePorcelainV2 } from '../src/host/gitops.js'

describe('codex-shell porcelain-v2 parser', () => {
  it('parses branch headers, ahead/behind and XY codes', () => {
    const raw = [
      '# branch.oid 0123456789abcdef',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      '1 M. . 100644 100644 100644 1111111111111111111111111111111111111111 2222222222222222222222222222222222222222 src/a.ts',
      '1 A. . 100644 000000 100644 1111111111111111111111111111111111111111 1111111111111111111111111111111111111111 src/b.ts',
      '? src/new.txt',
    ].join('\0')
    const parsed = parsePorcelainV2(raw)
    expect(parsed.branch).toBe('main')
    expect(parsed.upstream).toBe('origin/main')
    expect(parsed.ahead).toBe(2)
    expect(parsed.behind).toBe(1)
    expect(parsed.entries).toEqual([
      { path: 'src/a.ts', origPath: null, xy: 'M.' },
      { path: 'src/b.ts', origPath: null, xy: 'A.' },
      { path: 'src/new.txt', origPath: null, xy: '??' },
    ])
  })

  it('splits rename entries into orig and new path', () => {
    const raw = [
      '# branch.head main',
      '2 R. . 100644 100644 100644 1111111111111111111111111111111111111111 2222222222222222222222222222222222222222 R100 old.ts\tnew.ts',
    ].join('\0')
    const parsed = parsePorcelainV2(raw)
    expect(parsed.entries[0]).toEqual({ path: 'new.ts', origPath: 'old.ts', xy: 'R.' })
  })

  it('parses unmerged entries and paths with leading spaces', () => {
    const raw = [
      '# branch.head main',
      'u UU . 100644 100644 100644 100644 1111111111111111111111111111111111111111 2222222222222222222222222222222222222222 3333333333333333333333333333333333333333 spaced name.ts',
    ].join('\0')
    const parsed = parsePorcelainV2(raw)
    expect(parsed.entries[0]).toEqual({ path: 'spaced name.ts', origPath: null, xy: 'UU' })
  })
})
