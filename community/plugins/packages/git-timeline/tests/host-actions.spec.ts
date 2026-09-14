/**
 * 宿主写操作的两条约定：
 * ①暂存区为空时提交自动暂存已跟踪改动（面板「提交和推送」不单独暂存）；
 * ②git 失败以带 code 的结构化错误上抛，保留 git 原话——否则面板只能显示空消息。
 */
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import { describe, expect, it } from 'vitest'
import { commit } from '../src/host/actions.ts'

/** 一条按命令匹配的应答；同一条匹配可排队多个应答，用完后沿用最后一个。 */
interface Answer {
  readonly stdout?: string
  readonly stderr?: string
  readonly exitCode?: number
}

const ROOT = 'E:/repo'

/**
 * 造一个假 shell：按命令正则应答，并记录调用顺序。
 * @param rules - 匹配规则与应答队列
 */
function fakeShell(rules: readonly { match: RegExp; answers: readonly Answer[] }[]) {
  const calls: string[] = []
  const shell = {
    calls,
    resolve: (request: { command: string }) => ({ command: request.command }),
    run: async (spec: { command: string }) => {
      const command = spec.command
      calls.push(command)
      const rule = rules.find(candidate => candidate.match.test(command))
      const answer = rule === undefined ? undefined : rule.answers.length > 1 ? rule.answers.shift() : rule.answers[0]
      return {
        exitCode: answer?.exitCode ?? 0,
        stdout: { text: answer?.stdout ?? '' },
        stderr: { text: answer?.stderr ?? '' },
      }
    },
  }
  return shell as unknown as ShellExecutor & { calls: string[] }
}

/** 每个用例都需要的仓库根探测。 */
const rootRule = { match: /rev-parse' '--show-toplevel/, answers: [{ stdout: `${ROOT}\n` }] }

describe('commit 的暂存兜底', () => {
  it('暂存区为空时先 git add -u，再提交已跟踪改动', async () => {
    const shell = fakeShell([
      rootRule,
      { match: /diff' '--cached' '--name-only/, answers: [{ stdout: '' }, { stdout: 'a.ts\n' }] },
      { match: /rev-parse' '--short' 'HEAD/, answers: [{ stdout: 'abc1234\n' }] },
      { match: /commit' '-m'/, answers: [{ stdout: '[dev abc1234] 提交\n' }] },
    ])
    const result = await commit(shell, ROOT, '一次提交', false)
    expect(result.shortHash).toBe('abc1234')
    expect(shell.calls.some(call => call.includes("'add'"))).toBe(true)
    expect(shell.calls.findIndex(call => call.includes("'add'")))
      .toBeLessThan(shell.calls.findIndex(call => call.includes("'commit'")))
  })

  it('已有暂存内容时不再自动暂存', async () => {
    const shell = fakeShell([
      rootRule,
      { match: /diff' '--cached' '--name-only/, answers: [{ stdout: 'a.ts\n' }] },
      { match: /rev-parse' '--short' 'HEAD/, answers: [{ stdout: 'abc1234\n' }] },
      { match: /commit' '-m'/, answers: [{ stdout: '[dev abc1234] 提交\n' }] },
    ])
    await commit(shell, ROOT, '一次提交', false)
    expect(shell.calls.some(call => call.includes("'add'"))).toBe(false)
  })

  it('仍无任何可提交内容时报明确错误，而不是让 git 抛空消息', async () => {
    const shell = fakeShell([
      rootRule,
      { match: /diff' '--cached' '--name-only/, answers: [{ stdout: '' }, { stdout: '' }] },
    ])
    await expect(commit(shell, ROOT, '一次提交', false)).rejects.toMatchObject({
      message: expect.stringContaining('没有可提交的更改'),
    })
  })

  it('amend 不触发自动暂存', async () => {
    const shell = fakeShell([
      rootRule,
      { match: /rev-parse' '--short' 'HEAD/, answers: [{ stdout: 'abc1234\n' }] },
      { match: /commit' '--amend'/, answers: [{ stdout: '[dev abc1234] 修补\n' }] },
    ])
    await commit(shell, ROOT, '修补信息', true)
    expect(shell.calls.join(' | ')).not.toContain("add '-u'")
  })
})

describe('git 失败的结构化上报', () => {
  it('把 git 的 stderr 带进错误消息与负载，并给出稳定 code', async () => {
    const shell = fakeShell([
      { match: /rev-parse' '--show-toplevel/, answers: [{ stdout: `${ROOT}\n` }] },
      {
        match: /diff' '--cached' '--name-only/,
        answers: [{ stdout: 'a.ts\n' }],
      },
      { match: /commit' '-m'/, answers: [{ stderr: 'fatal: 无可提交内容\n', exitCode: 1 }] },
    ])
    let thrown: unknown
    try {
      await commit(shell, ROOT, '一次提交', false)
    } catch (error: unknown) {
      thrown = error
    }
    expect(thrown).toBeDefined()
    expect(String(thrown)).toContain('fatal: 无可提交内容')
    expect((thrown as { code?: string }).code).toBe('git/command-failed')
    expect(JSON.stringify((thrown as { details?: unknown }).details)).toContain('exitCode')
  })
})
