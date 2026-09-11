/** 宿主侧解析与路径工具的回归测试。 */

import { describe, expect, it } from 'vitest'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import { checkout, createBranch, readBranches } from '../src/host/branches.js'
import { parseLog, parseNameStatus } from '../src/host/history.js'
import { lastLine, repoRelative } from '../src/host/run.js'
import { parsePorcelainV2, splitEntries } from '../src/host/status.js'

/** 伪 shell：按命令内容给出定值输出，并记录每条命令。 */
function fakeShell(handler: (command: string) => { stdout?: string; stderr?: string; exitCode?: number }) {
  const commands: string[] = []
  const shell = {
    resolve: (spec: { command: string }) => { commands.push(spec.command); return spec },
    run: async (spec: { command: string }) => {
      const outcome = handler(spec.command)
      return {
        exitCode: outcome.exitCode ?? 0,
        stdout: { text: outcome.stdout ?? '' },
        stderr: { text: outcome.stderr ?? '' },
      }
    },
  } as unknown as ShellExecutor
  return { shell, commands }
}

describe('branches', () => {
  it('lists local branches in git order and skips blank lines', async () => {
    const { shell, commands } = fakeShell(command => (command.includes('rev-parse')
      ? { stdout: 'E:/repo\n' }
      : { stdout: 'dev\nmain\n\nfeature/x\n' }))
    const result = await readBranches(shell, 'E:/repo')
    expect(result).toEqual({ repo: true, names: ['dev', 'main', 'feature/x'], error: null })
    expect(commands[1]).toContain('for-each-ref')
    expect(commands[1]).toContain('refs/heads')
  })

  it('reports a non-repository workspace as not a repo', async () => {
    const { shell } = fakeShell(() => ({ stderr: 'fatal: not a git repository', exitCode: 128 }))
    expect(await readBranches(shell, 'E:/nope')).toEqual({ repo: false, names: [], error: null })
  })

  it('validates the new branch name before creating it', async () => {
    const { shell, commands } = fakeShell(command => (command.includes('rev-parse')
      ? { stdout: 'E:/repo\n' }
      : { stdout: 'Switched to a new branch\n' }))
    await createBranch(shell, 'E:/repo', ' feature/panel ')
    expect(commands.some(command => command.includes('check-ref-format'))).toBe(true)
    expect(commands.at(-1)).toContain("'checkout' '-b' 'feature/panel'")
  })

  it('rejects an empty branch name before calling git', async () => {
    const { shell, commands } = fakeShell(() => ({ stdout: 'E:/repo\n' }))
    await expect(checkout(shell, 'E:/repo', '   ')).rejects.toThrow('分支名不能为空')
    expect(commands.some(command => command.includes('checkout'))).toBe(false)
  })
})

describe('porcelain-v2 status', () => {
  it('parses branch facts, ahead/behind, and every entry frame', () => {
    const raw = [
      '# branch.oid 1111111111111111111111111111111111111111',
      '# branch.head dev',
      '# branch.upstream origin/dev',
      '# branch.ab +2 -1',
      '1 M. N... 100644 100644 100644 aaa bbb src/staged.ts',
      '1 .M N... 100644 100644 100644 aaa bbb src/worktree.ts',
      '2 R. N... 100644 100644 100644 aaa bbb R100 src/new.ts\0src/old.ts',
      '? notes.md',
      '',
    ].join('\0')
    const parsed = parsePorcelainV2(raw)
    expect(parsed.branch).toBe('dev')
    expect(parsed.upstream).toBe('origin/dev')
    expect(parsed.ahead).toBe(2)
    expect(parsed.behind).toBe(1)
    expect(parsed.entries).toEqual([
      { path: 'src/staged.ts', origPath: null, xy: 'M.' },
      { path: 'src/worktree.ts', origPath: null, xy: '.M' },
      { path: 'src/new.ts', origPath: 'src/old.ts', xy: 'R.' },
      { path: 'notes.md', origPath: null, xy: '??' },
    ])
  })

  it('reports a detached head as a null branch', () => {
    expect(parsePorcelainV2('# branch.head (detached)\0').branch).toBeNull()
  })

  it('splits staged and worktree sides, keeping both sides of MM and untracked only in changes', () => {
    const { staged, changes } = splitEntries([
      { path: 'a.ts', origPath: null, xy: 'M.' },
      { path: 'b.ts', origPath: null, xy: '.M' },
      { path: 'c.ts', origPath: null, xy: 'MM' },
      { path: 'd.ts', origPath: null, xy: '??' },
    ])
    expect(staged.map(entry => entry.path)).toEqual(['a.ts', 'c.ts'])
    expect(changes.map(entry => entry.path)).toEqual(['b.ts', 'c.ts', 'd.ts'])
  })
})

describe('commit name-status', () => {
  it('reads one file per status frame', () => {
    expect(parseNameStatus('M\0src/a.ts\0A\0src/b.ts\0D\0old.ts\0')).toEqual([
      { path: 'src/a.ts', origPath: null, status: 'M' },
      { path: 'src/b.ts', origPath: null, status: 'A' },
      { path: 'old.ts', origPath: null, status: 'D' },
    ])
  })

  it('consumes the extra frame of a rename record', () => {
    expect(parseNameStatus('R100\0old.ts\0new.ts\0M\0other.ts\0')).toEqual([
      { path: 'new.ts', origPath: 'old.ts', status: 'R' },
      { path: 'other.ts', origPath: null, status: 'M' },
    ])
  })

  it('returns nothing for an empty result', () => {
    expect(parseNameStatus('')).toEqual([])
  })
})

describe('log format', () => {
  it('reads parents, subject and refs from the configured format', () => {
    const line = ['abc1234', 'abcdef0123456789', 'p1 p2', '整理 Git 面板', 'dev', '2026-09-11 10:00:00 +0800', 'HEAD -> dev'].join('\x1f')
    expect(parseLog(`${line}\n`)).toEqual([{
      shortHash: 'abc1234',
      hash: 'abcdef0123456789',
      parents: ['p1', 'p2'],
      subject: '整理 Git 面板',
      author: 'dev',
      date: '2026-09-11 10:00:00 +0800',
      refs: 'HEAD -> dev',
    }])
  })

  it('treats a root commit with no parents as an empty parent list', () => {
    const line = ['abc1234', 'abcdef0123456789', '', 'init', 'dev', '2026-09-11 10:00:00 +0800', ''].join('\x1f')
    expect(parseLog(line).at(0)?.parents).toEqual([])
  })
})

describe('path helpers', () => {
  it('normalizes repository-relative input', () => {
    expect(repoRelative('E:/repo', './src/a.ts')).toBe('src/a.ts')
    expect(repoRelative('E:/repo', 'E:\\repo\\src\\a.ts')).toBe('src/a.ts')
    expect(repoRelative('E:/repo', '  ')).toBe('')
    expect(repoRelative('E:/repo', 'E:/other/a.ts')).toBe('E:/other/a.ts')
  })

  it('returns the last non-empty output line', () => {
    expect(lastLine('a\n\n b \n')).toBe('b')
    expect(lastLine('')).toBe('')
  })
})
