import { describe, expect, it } from 'vitest'
import { parsePorcelain, repoRelative } from '../src/host/git.js'

describe('dsh-git-timeline porcelain parser', () => {
  it('parses modified, staged, untracked and deleted records', () => {
    const raw = [' M src/a.ts', 'M  src/b.ts', '?? notes.md', 'D  gone.ts', ''].join('\0')
    expect(parsePorcelain(raw)).toEqual([
      { path: 'src/a.ts', origPath: null, status: ' M' },
      { path: 'src/b.ts', origPath: null, status: 'M ' },
      { path: 'notes.md', origPath: null, status: '??' },
      { path: 'gone.ts', origPath: null, status: 'D ' },
    ])
  })

  it('consumes the second NUL record of a rename as the original path', () => {
    const raw = ['R  new/name.ts', 'old/name.ts', ' M after.ts', ''].join('\0')
    expect(parsePorcelain(raw)).toEqual([
      { path: 'new/name.ts', origPath: 'old/name.ts', status: 'R ' },
      { path: 'after.ts', origPath: null, status: ' M' },
    ])
  })

  it('ignores short frames and stops producing fields past the cap', () => {
    expect(parsePorcelain('\0 \0')).toEqual([])
    const many = Array.from({ length: 600 }, (_, index) => ` M f${String(index)}.ts`).join('\0')
    expect(parsePorcelain(many).length).toBe(500)
  })
})

describe('dsh-git-timeline repository-relative paths', () => {
  it('keeps relative paths and strips a leading ./', () => {
    expect(repoRelative('E:/repo', 'src/a.ts')).toBe('src/a.ts')
    expect(repoRelative('E:/repo', './src/a.ts')).toBe('src/a.ts')
    expect(repoRelative('E:/repo', '  ')).toBe('')
  })

  it('converts absolute paths inside the root and passes through foreign ones', () => {
    expect(repoRelative('E:/repo', 'E:/repo/src/a.ts')).toBe('src/a.ts')
    expect(repoRelative('E:/repo', 'e:\\repo\\src\\a.ts')).toBe('src/a.ts')
    expect(repoRelative('E:/repo', 'E:/repo')).toBe('')
    expect(repoRelative('E:/repo', 'E:/other/a.ts')).toBe('E:/other/a.ts')
  })
})
