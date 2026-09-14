/** GitHub 登录态：探测分支、署名推导与登录命令形态。 */

import { describe, expect, it } from 'vitest'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import { readGithubIdentity, readGithubStatus, signInWithGithub } from '../src/host/github.js'

interface RecordedSpec {
  command: string
  stdin?: string
  env?: Record<string, string>
}

/** 伪 shell：按命令给出定值输出，并记录每条 spec（含 stdin 与环境）。 */
function fakeShell(handler: (command: string, spec: RecordedSpec) => { stdout?: string; stderr?: string; exitCode?: number }) {
  const specs: RecordedSpec[] = []
  const shell = {
    resolve: (spec: RecordedSpec) => { specs.push(spec); return spec },
    run: async (spec: RecordedSpec) => {
      const outcome = handler(spec.command, spec)
      return {
        exitCode: outcome.exitCode ?? 0,
        stdout: { text: outcome.stdout ?? '' },
        stderr: { text: outcome.stderr ?? '' },
      }
    },
  } as unknown as ShellExecutor
  return { shell, specs }
}

/** 本机 git 凭据助手：system 返回 manager。 */
function helperAnswer(command: string): { stdout?: string; exitCode?: number } {
  if (command.includes('credential.helper') && command.includes('--system')) return { stdout: 'manager\n' }
  return { exitCode: 1 }
}

describe('readGithubStatus', () => {
  it('reports an installed, signed-in gh together with the credential helper', async () => {
    const { shell } = fakeShell((command) => {
      const helper = helperAnswer(command)
      if (helper.exitCode === 1 && command.includes('credential.helper')) return helper
      if (command.includes('gh --version')) return { stdout: 'gh version 2.100.0\n' }
      if (command.includes('gh auth status')) return { stdout: 'Logged in to github.com account kw-96\n' }
      if (command.includes('gh api user')) return { stdout: '{"login":"kw-96","id":42,"name":"匡振威","email":null}\n' }
      return helper
    })
    expect(await readGithubStatus(shell, 'E:/repo')).toEqual({
      ghInstalled: true,
      ghLoggedIn: true,
      account: 'kw-96',
      credentialHelper: 'manager',
    })
  })

  it('reports gh as absent when the probe fails', async () => {
    const { shell } = fakeShell((command) => {
      if (command.includes('credential.helper')) return { exitCode: 1 }
      return { exitCode: 1, stderr: 'not recognized' }
    })
    expect(await readGithubStatus(shell, 'E:/repo')).toEqual({
      ghInstalled: false,
      ghLoggedIn: false,
      account: null,
      credentialHelper: null,
    })
  })

  it('separates "installed" from "signed in"', async () => {
    const { shell } = fakeShell((command) => {
      if (command.includes('credential.helper')) return helperAnswer(command)
      if (command.includes('gh --version')) return { stdout: 'gh version 2.100.0\n' }
      return { exitCode: 1, stderr: 'not logged in' }
    })
    expect(await readGithubStatus(shell, 'E:/repo')).toEqual({
      ghInstalled: true,
      ghLoggedIn: false,
      account: null,
      credentialHelper: 'manager',
    })
  })
})

describe('readGithubIdentity', () => {
  it('uses the public email when GitHub exposes one', async () => {
    const { shell } = fakeShell(() => ({ stdout: '{"login":"kw-96","id":42,"name":"匡振威","email":"me@example.com"}' }))
    expect(await readGithubIdentity(shell, 'E:/repo')).toEqual({ name: '匡振威', email: 'me@example.com' })
  })

  it('falls back to the noreply address when the email is private', async () => {
    const { shell } = fakeShell(() => ({ stdout: '{"login":"kw-96","id":42,"name":null,"email":null}' }))
    expect(await readGithubIdentity(shell, 'E:/repo')).toEqual({ name: 'kw-96', email: '42+kw-96@users.noreply.github.com' })
  })

  it('reports no identity when the account cannot be read', async () => {
    const { shell } = fakeShell(() => ({ exitCode: 1, stderr: 'offline' }))
    expect(await readGithubIdentity(shell, 'E:/repo')).toBeNull()
  })
})

describe('signInWithGithub', () => {
  it('asks the credential helper for github.com and never surfaces the secret', async () => {
    const { shell, specs } = fakeShell((command) => {
      const helper = helperAnswer(command)
      if (command.includes('credential.helper')) return helper
      if (command.includes('git credential fill')) {
        return { stdout: 'protocol=https\nhost=github.com\nusername=kw-96\npassword=gho_secret\n' }
      }
      if (command.includes('gh --version')) return { stdout: 'gh version 2.100.0\n' }
      if (command.includes('gh auth status')) return { stdout: 'ok\n' }
      if (command.includes('gh api user')) return { stdout: '{"login":"kw-96"}' }
      return helper
    })
    const status = await signInWithGithub(shell, 'E:/repo')

    const fill = specs.find(spec => spec.command === 'git credential fill')
    expect(fill?.stdin).toBe('protocol=https\nhost=github.com\n\n')
    // 无人值守：凭据助手的失败必须是错误，而不是挂在终端提示上。
    expect(fill?.env?.GIT_TERMINAL_PROMPT).toBe('0')
    // 返回值只描述登录态，绝不含凭据内容。
    expect(JSON.stringify(status)).not.toContain('gho_secret')
    expect(status.ghLoggedIn).toBe(true)
  })

  it('reports a failed sign-in as an error the panel can show', async () => {
    const { shell } = fakeShell((command) => {
      if (command.includes('credential.helper')) return { exitCode: 1 }
      if (command.includes('git credential fill')) return { exitCode: 128, stderr: 'could not read Username' }
      return { exitCode: 1 }
    })
    await expect(signInWithGithub(shell, 'E:/repo')).rejects.toThrow('GitHub 登录未完成')
  })
})
