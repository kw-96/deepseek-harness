import { describe, expect, it } from 'vitest'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import { gitLog, parsePorcelainV2 } from '../src/host/gitops.js'

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

  it('appends a path filter to git log for per-file timelines', async () => {
    const commands: string[] = []
    const shell = {
      resolve: (spec: { command: string; workdir: string }) => { commands.push(spec.command); return spec },
      run: async () => ({
        exitCode: 0,
        stdout: { text: 'abc1234\x1f整理文件面板\x1fdev\x1f2026-09-08 10:00:00 +0800\x1f' },
        stderr: { text: '' },
      }),
    } as unknown as ShellExecutor
    const result = await gitLog(shell, 'E:\\repo', 30, 'src\\a.ts')
    expect(commands[0]).toContain("'-30'")
    expect(commands[0]).toContain("'--' 'src\\a.ts'")
    expect(result.entries).toEqual([
      { hash: 'abc1234', subject: '整理文件面板', author: 'dev', date: '2026-09-08 10:00:00 +0800', refs: '' },
    ])
    // 不带 path 时命令不追加 '--' 过滤段。
    commands.length = 0
    await gitLog(shell, 'E:\\repo', 10)
    expect(commands[0]).toContain("'-10'")
    expect(commands[0]).not.toContain("'--'")
  })
})
