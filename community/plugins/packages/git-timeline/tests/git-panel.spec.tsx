// @vitest-environment jsdom
/** Git 面板的交互回归：提交方式切换、模型生成提交信息、变更行操作与底部栏。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GitStatusResponse } from '../src/types.js'
import type { GitPanelApi } from '../src/client/faces.js'
import { GitBody, type GitBodyProps } from '../src/client/GitBody.js'
import { actionLabelKey, COMMIT_ACTIONS } from '../src/client/Changes.js'
import { parseRefs, splitPath, statusKind, statusLetter } from '../src/client/format.js'
import { zh } from '../src/client/locales.js'

const t = (key: string, params?: Record<string, unknown>): string => {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template,
  )
}

const status: GitStatusResponse = {
  repo: true,
  root: 'E:/repo',
  error: null,
  branch: 'dev',
  upstream: 'origin/dev',
  ahead: 1,
  behind: 0,
  staged: [{ path: 'src/staged.ts', origPath: null, xy: 'M.' }],
  changes: [{ path: 'src/new.ts', origPath: null, xy: '??' }],
}

function api(over: Partial<GitPanelApi> = {}): GitPanelApi {
  return {
    status: vi.fn(async () => status),
    log: vi.fn(async () => ({
      repo: true, root: 'E:/repo', error: null,
      entries: [{
        hash: 'h1', shortHash: 'abc1234', parents: ['h0'], subject: '整理 Git 面板',
        author: 'dev', date: '2026-09-11 10:00:00 +0800', refs: 'HEAD -> dev',
      }],
    })),
    stage: vi.fn(async () => ({ detail: '' })),
    unstage: vi.fn(async () => ({ detail: '' })),
    stageAll: vi.fn(async () => ({ detail: '' })),
    unstageAll: vi.fn(async () => ({ detail: '' })),
    commit: vi.fn(async () => ({ shortHash: 'abc1234', detail: '' })),
    push: vi.fn(async () => ({ detail: '' })),
    pull: vi.fn(async () => ({ detail: '' })),
    fetch: vi.fn(async () => ({ detail: '' })),
    identity: vi.fn(async () => ({ name: 'dev', email: 'dev@example.test' })),
    message: vi.fn(async () => ({ message: '整理 Git 面板', provider: 'deepseek', model: 'chat' })),
    ...over,
  } as GitPanelApi
}

function props(over: Partial<GitBodyProps> = {}): GitBodyProps {
  const state = { current: 's1', byId: { s1: { cwd: 'E:/repo' } } }
  return {
    sessionId: 's1',
    useSessions: ((selector: (value: typeof state) => unknown) => selector(state)) as never,
    t,
    api: api(),
    ...over,
  } as GitBodyProps
}

afterEach(cleanup)

describe('git panel helpers', () => {
  it('maps porcelain letters to display letters and kinds', () => {
    expect(statusLetter('??')).toBe('U')
    expect(statusLetter(' M')).toBe('M')
    expect(statusKind('??')).toBe('added')
    expect(statusKind('D ')).toBe('deleted')
    expect(statusKind(' M')).toBe('modified')
  })

  it('splits a path into name and directory', () => {
    expect(splitPath('src/client/GitBody.tsx')).toEqual({ name: 'GitBody.tsx', dir: 'src/client/' })
    expect(splitPath('readme.md')).toEqual({ name: 'readme.md', dir: '' })
  })

  it('marks the head ref and tags', () => {
    expect(parseRefs('HEAD -> dev, origin/dev, tag: v1.0', 'dev')).toEqual([
      { label: 'dev', kind: 'head' },
      { label: 'origin/dev', kind: 'branch' },
      { label: 'v1.0', kind: 'tag' },
    ])
  })

  it('labels every commit action', () => {
    expect(COMMIT_ACTIONS.map(actionLabelKey)).toEqual(['commit', 'commitAmend', 'commitPush', 'commitSync'])
  })
})

describe('git panel body', () => {
  it('lists staged and changed files with their status letters', async () => {
    render(<GitBody {...props()} />)
    expect(await screen.findByText('staged.ts')).toBeTruthy()
    expect(screen.getByText('new.ts')).toBeTruthy()
    expect(screen.getAllByText('src/').length).toBeGreaterThan(0)
    expect(screen.getByText('已暂存')).toBeTruthy()
    expect(screen.getByText('更改')).toBeTruthy()
    expect(await screen.findByText('整理 Git 面板')).toBeTruthy()
  })

  it('switches the commit action from the caret menu', async () => {
    render(<GitBody {...props()} />)
    fireEvent.click(await screen.findByRole('button', { name: '选择提交方式' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '提交(修改)' }))
    expect(screen.getAllByRole('button', { name: '提交(修改)' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '提交(修改)' })).toBeTruthy()
  })

  it('commits with the chosen action and clears the message', async () => {
    const commit = vi.fn(async () => ({ shortHash: 'abc1234', detail: '' }))
    const custom = api({ commit })
    render(<GitBody {...props({ api: custom })} />)
    const input = await screen.findByLabelText('提交信息（Ctrl+Enter 提交）')
    fireEvent.change(input, { target: { value: '整理 Git 面板' } })
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await waitFor(() => expect(commit).toHaveBeenCalledWith('E:/repo', '整理 Git 面板', false))
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''))
  })

  it('drafts the message with the session model and stages a changed file', async () => {
    const message = vi.fn(async () => ({ message: '草稿：整理 Git 面板', provider: 'deepseek', model: 'chat' }))
    const stage = vi.fn(async () => ({ detail: '' }))
    const custom = api({ message, stage })
    render(<GitBody {...props({ api: custom })} />)
    fireEvent.click(await screen.findByRole('button', { name: '用当前会话的模型生成提交信息' }))
    await waitFor(() => expect(message).toHaveBeenCalledWith('s1', 'E:/repo'))
    await waitFor(() => {
      expect((screen.getByLabelText('提交信息（Ctrl+Enter 提交）') as HTMLTextAreaElement).value).toBe('草稿：整理 Git 面板')
    })
    fireEvent.click(screen.getByRole('button', { name: '暂存 src/new.ts' }))
    await waitFor(() => expect(stage).toHaveBeenCalledWith('E:/repo', ['src/new.ts']))
  })

  it('shows branch, workspace and account in the bottom bar', async () => {
    render(<GitBody {...props()} />)
    const branch = await screen.findByTitle('当前分支')
    expect(branch.textContent).toContain('dev')
    expect(branch.textContent).toContain('↑1')
    expect(screen.getByTitle('repo')).toBeTruthy()
    expect(screen.getByTitle('dev · dev@example.test')).toBeTruthy()
  })
})
