/** Git 身份：读取（含来源）与写入的命令形态。 */

import { describe, expect, it } from 'vitest'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import { parseIdent, readIdentity, writeIdentity } from '../src/host/identity.js'

/** 伪 shell：按命令给出定值输出，并记录每条命令。 */
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

describe('parseIdent', () => {
  it('reads name and email from a git var ident line', () => {
    expect(parseIdent('kw-96 <530340624@qq.com> 1789115396 +0800')).toEqual({
      name: 'kw-96',
      email: '530340624@qq.com',
    })
  })

  it('tolerates an empty name or email', () => {
    expect(parseIdent('<> 1700000000 +0000')).toEqual({ name: null, email: null })
    expect(parseIdent('not an ident')).toEqual({ name: null, email: null })
  })
})

describe('readIdentity', () => {
  it('reports the value and the config file it came from', async () => {
    const { shell } = fakeShell(command => command.includes('user.name')
      ? { stdout: 'file:C:/Users/N33384/.gitconfig\tkw-96\n' }
      : { stdout: 'file:C:/Users/N33384/.gitconfig\t530340624@qq.com\n' })
    expect(await readIdentity(shell, 'E:/repo')).toEqual({
      name: 'kw-96',
      email: '530340624@qq.com',
      origin: 'C:/Users/N33384/.gitconfig',
    })
  })

  it('falls back to git var when neither config key resolves', async () => {
    const { shell, commands } = fakeShell(command => (command.includes('var')
      ? { stdout: 'kw-96 <530340624@qq.com> 1789115396 +0800\n' }
      : { stderr: '', exitCode: 1 }))
    expect(await readIdentity(shell, 'E:/repo')).toEqual({
      name: 'kw-96',
      email: '530340624@qq.com',
      origin: null,
    })
    expect(commands.some(command => command.includes("'var' 'GIT_COMMITTER_IDENT'"))).toBe(true)
  })

  it('reports an unconfigured identity when even git var refuses', async () => {
    const { shell } = fakeShell(() => ({ stderr: '', exitCode: 1 }))
    expect(await readIdentity(shell, 'E:/repo')).toEqual({ name: null, email: null, origin: null })
  })
})

describe('writeIdentity', () => {
  it('writes both keys to the global config by default', async () => {
    const { shell, commands } = fakeShell(command => (command.includes('rev-parse')
      ? { stdout: 'E:/repo\n' }
      : { stdout: '' }))
    const result = await writeIdentity(shell, 'E:/repo', ' kw-96 ', ' 530340624@qq.com ', 'global')
    expect(result.detail).toBe('kw-96 <530340624@qq.com>')
    expect(commands.some(command => command.includes("'config' '--global' 'user.name' 'kw-96'"))).toBe(true)
    expect(commands.some(command => command.includes("'config' '--global' 'user.email' '530340624@qq.com'"))).toBe(true)
  })

  it('writes the repository config when asked for local scope', async () => {
    const { shell, commands } = fakeShell(command => (command.includes('rev-parse')
      ? { stdout: 'E:/repo\n' }
      : { stdout: '' }))
    await writeIdentity(shell, 'E:/repo', 'dev', 'dev@example.test', 'local')
    expect(commands.some(command => command.includes("'config' '--local' 'user.name' 'dev'"))).toBe(true)
  })

  it('rejects blank fields and non-repository workspaces', async () => {
    const { shell } = fakeShell(command => (command.includes('rev-parse')
      ? { stdout: 'E:/repo\n' }
      : { stdout: '' }))
    await expect(writeIdentity(shell, 'E:/repo', '  ', 'a@b', 'global')).rejects.toThrow('姓名不能为空')
    await expect(writeIdentity(shell, 'E:/repo', 'dev', ' ', 'global')).rejects.toThrow('邮箱不能为空')
    const { shell: outside } = fakeShell(() => ({ stderr: 'fatal: not a git repository', exitCode: 128 }))
    await expect(writeIdentity(outside, 'E:/nope', 'dev', 'a@b', 'local')).rejects.toThrow('不是 Git 仓库')
  })
})
