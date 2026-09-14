/**
 * 推送遇到本地钩子故障时的恢复：跳过钩子重试一次，并如实说明跳过了检查。
 * 用鸭子类型的壳执行器打桩，不启动真实 shell。
 */

import { describe, expect, it, vi } from 'vitest'
import type { ShellExecutor, ShellExecSpec } from '@deepseek-ai/dsh-shell'
import { commit, isHookFailure, push } from '../src/host/actions.js'

/** 一次 git 调用的记录。 */
interface Executed {
  command: string
  env: Record<string, string> | undefined
}

/**
 * 构造一个按命令脚本应答的壳执行器。
 * @param reply 依据命令与环境给出退出码和输出
 * @returns 壳执行器与调用记录
 */
function fakeShell(reply: (command: string, env: Record<string, string> | undefined) => {
  exitCode: number
  stdout?: string
  stderr?: string
}): { shell: ShellExecutor; executed: Executed[] } {
  const executed: Executed[] = []
  const shell = {
    resolve(request: { command: string; env?: Record<string, string> }): ShellExecSpec {
      executed.push({ command: request.command, env: request.env })
      return request as unknown as ShellExecSpec
    },
    run: (spec: ShellExecSpec): Promise<unknown> => {
      const record = executed.at(-1)
      const answer = reply(record?.command ?? '', record?.env)
      return Promise.resolve({
        exitCode: answer.exitCode,
        stdout: { text: answer.stdout ?? '' },
        stderr: { text: answer.stderr ?? '' },
      })
    },
  } as unknown as ShellExecutor
  return { shell, executed }
}

describe('钩子故障识别', () => {
  it('识别 Cygwin 信号管道失败与其他钩子故障', () => {
    expect(isHookFailure("1 [main] sh (10328) D:\\Program Files\\Git\\usr\\bin\\sh.exe: *** fatal error - couldn't create signal pipe, Win32 error 5")).toBe(true)
    expect(isHookFailure('lefthook: hook failed')).toBe(true)
  })

  it('不把网络与仓库状态错误当成钩子故障', () => {
    expect(isHookFailure('fatal: unable to access ... Could not resolve host: github.com')).toBe(false)
    expect(isHookFailure('fatal: The current branch dev has no upstream branch.')).toBe(false)
  })
})

describe('推送的钩子恢复', () => {
  it('钩子起不来时跳过钩子重试，并在回执里说明', async () => {
    const { shell, executed } = fakeShell((command, env) => {
      if (command.includes('rev-parse')) return { exitCode: 0, stdout: 'E:/repo\n' }
      // 首次推送：钩子进程无法创建信号管道。
      if (env?.LEFTHOOK !== '0') {
        return { exitCode: 128, stderr: "sh.exe: *** fatal error - couldn't create signal pipe, Win32 error 5" }
      }
      return { exitCode: 0, stderr: 'To github.com:kw-96/deepseek-harness.git\n   abc1234..def5678  dev -> dev' }
    })

    const result = await push(shell, 'E:/repo')

    expect(result.detail).toContain('dev -> dev')
    expect(result.detail).toContain('已跳过')
    // 第二次推送显式带上 LEFTHOOK=0。
    const pushes = executed.filter(entry => entry.command.includes('push'))
    expect(pushes).toHaveLength(2)
    expect(pushes[1]?.env?.LEFTHOOK).toBe('0')
  })

  it('网络类失败不触发跳过钩子的重试', async () => {
    const { shell, executed } = fakeShell((command) => {
      if (command.includes('rev-parse')) return { exitCode: 0, stdout: 'E:/repo\n' }
      return { exitCode: 128, stderr: 'fatal: unable to access ... Could not resolve host: github.com' }
    })

    await expect(push(shell, 'E:/repo')).rejects.toThrow('Could not resolve host')
    expect(executed.filter(entry => entry.command.includes('push'))).toHaveLength(1)
  })

  it('推送成功时不做任何重试', async () => {
    const run = vi.fn()
    const { shell, executed } = fakeShell((command) => {
      if (command.includes('rev-parse')) return { exitCode: 0, stdout: 'E:/repo\n' }
      run()
      return { exitCode: 0, stderr: 'Everything up-to-date' }
    })

    const result = await push(shell, 'E:/repo')

    expect(result.detail).toBe('Everything up-to-date')
    expect(run).toHaveBeenCalledTimes(1)
    expect(executed.filter(entry => entry.command.includes('push'))).toHaveLength(1)
  })
})

describe('提交的钩子恢复', () => {
  it('pre-commit 起不来时跳过钩子重试，并如实告知', async () => {
    const { shell, executed } = fakeShell((command, env) => {
      if (command.includes('rev-parse')) return { exitCode: 0, stdout: 'abc1234\n' }
      // 暂存区已有内容：提交前的自动暂存探测直接返回，失败点留在真正的提交上。
      if (command.includes("'--cached'")) return { exitCode: 0, stdout: 'src/a.ts\n' }
      return env?.LEFTHOOK === '0'
        ? { exitCode: 0, stdout: '[dev abc1234] 整理 Git 面板' }
        : { exitCode: 1, stderr: "sh.exe: *** fatal error - couldn't create signal pipe, Win32 error 5" }
    })

    const result = await commit(shell, 'E:/repo', '整理 Git 面板', false)

    expect(result.shortHash).toBe('abc1234')
    expect(result.detail).toContain('整理 Git 面板')
    expect(result.detail).toContain('已跳过')
    const commits = executed.filter(entry => entry.command.includes("'commit'"))
    expect(commits).toHaveLength(2)
    expect(commits[1]?.env?.LEFTHOOK).toBe('0')
  })

  it('非钩子类失败不触发跳过钩子的重试', async () => {
    const { shell, executed } = fakeShell((command) => {
      if (command.includes('rev-parse')) return { exitCode: 0, stdout: 'abc1234\n' }
      if (command.includes("'--cached'")) return { exitCode: 0, stdout: 'src/a.ts\n' }
      return { exitCode: 1, stderr: 'fatal: 无法创建 .git/index.lock：文件已存在' }
    })

    await expect(commit(shell, 'E:/repo', '整理 Git 面板', false)).rejects.toThrow('.git/index.lock')
    expect(executed.filter(entry => entry.command.includes("'commit'"))).toHaveLength(1)
  })

  it('空索引与钩子故障同时出现时，先自动暂存再跳过钩子重试', async () => {
    let probes = 0
    const { shell, executed } = fakeShell((command, env) => {
      if (command.includes('rev-parse')) return { exitCode: 0, stdout: 'abc1234\n' }
      if (command.includes("'--cached'")) {
        probes += 1
        // 首次探测为空触发自动暂存，之后报告已暂存，提交才得以继续。
        return { exitCode: 0, stdout: probes === 1 ? '' : 'src/a.ts\n' }
      }
      if (command.includes("'add'")) return { exitCode: 0 }
      return env?.LEFTHOOK === '0'
        ? { exitCode: 0, stdout: '[dev abc1234] 整理 Git 面板' }
        : { exitCode: 1, stderr: "sh.exe: *** fatal error - couldn't create signal pipe, Win32 error 5" }
    })

    const result = await commit(shell, 'E:/repo', '整理 Git 面板', false)

    expect(result.detail).toContain('已跳过')
    expect(executed.filter(entry => entry.command.includes("'add'"))).toHaveLength(1)
    const commits = executed.filter(entry => entry.command.includes("'commit'"))
    expect(commits).toHaveLength(2)
    expect(commits[1]?.env?.LEFTHOOK).toBe('0')
  })
})
