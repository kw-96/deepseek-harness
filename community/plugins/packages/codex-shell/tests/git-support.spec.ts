import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  displayPath, isUntracked, matchesFilter, parseDiff, statusLetter, timeAgo,
} from '../src/client/panels/git/support.js'
import { zh } from '../src/client/locales.js'

const t = (key: string, params?: Record<string, unknown>): string => {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template,
  )
}

afterEach(() => { vi.useRealTimers() })

describe('codex-shell git support', () => {
  it('derives staged/worktree status letters from porcelain XY', () => {
    expect(statusLetter({ path: 'a', origPath: null, xy: '.M' }, true)).toBe(' ')
    expect(statusLetter({ path: 'a', origPath: null, xy: '.M' }, false)).toBe('M')
    expect(statusLetter({ path: 'a', origPath: null, xy: 'A ' }, true)).toBe('A')
    expect(statusLetter({ path: 'a', origPath: null, xy: '??' }, false)).toBe('?')
    expect(statusLetter({ path: 'a', origPath: null, xy: 'DD' }, false)).toBe('D')
  })

  it('recognizes untracked entries and renders rename display paths', () => {
    expect(isUntracked({ path: 'a', origPath: null, xy: '??' })).toBe(true)
    expect(isUntracked({ path: 'a', origPath: null, xy: '.M' })).toBe(false)
    expect(displayPath({ path: 'new.ts', origPath: 'old.ts', xy: 'R ' })).toBe('old.ts → new.ts')
    expect(displayPath({ path: 'a.ts', origPath: null, xy: 'M ' })).toBe('a.ts')
  })

  it('filters paths case-insensitively with blank query passing everything', () => {
    expect(matchesFilter('src/App.tsx', 'app')).toBe(true)
    expect(matchesFilter('src/App.tsx', 'css')).toBe(false)
    expect(matchesFilter('src/App.tsx', '   ')).toBe(true)
  })

  it('classifies unified diff lines for coloring', () => {
    const lines = parseDiff([
      'diff --git a/x b/x',
      'index 1..2 100644',
      '--- a/x',
      '+++ b/x',
      '@@ -1,2 +1,3 @@',
      ' context',
      '+added',
      '-removed',
      '',
    ].join('\n'))
    expect(lines.map(line => line.kind)).toEqual([
      'meta', 'meta', 'meta', 'meta', 'hunk', 'context', 'add', 'del', 'context',
    ])
  })

  it('renders relative commit times', () => {
    const now = new Date('2026-09-06T12:00:00+08:00')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    expect(timeAgo(t, '2026-09-06 11:59:50 +0800')).toBe('刚刚')
    expect(timeAgo(t, '2026-09-06 11:35:00 +0800')).toBe('25 分钟前')
    expect(timeAgo(t, '2026-09-06 09:00:00 +0800')).toBe('3 小时前')
    expect(timeAgo(t, '2026-09-04 12:00:00 +0800')).toBe('2 天前')
    expect(timeAgo(t, 'not-a-date')).toBe('')
  })
})
