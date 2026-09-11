// @vitest-environment jsdom
/** Git 面板的交互回归：提交方式、模型生成、差异视图、丢弃确认、自动刷新与底部栏。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GitStatusResponse } from '../src/types.js'
import type { GitPanelApi, WorkspaceChangeFace } from '../src/client/lib/faces.js'
import { GitBody, type GitBodyProps } from '../src/client/panel/GitBody.js'
import { actionLabelKey, COMMIT_ACTIONS } from '../src/client/controller/state.js'
import { parseRefs, splitPath, statusKind, statusLetter } from '../src/client/lib/format.js'
import { parseDiffLines } from '../src/client/lib/diff.js'
import { zh } from '../src/client/lib/locales.js'

const t = (key: string, params?: Record<string, unknown>): string => {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template,
  )
}

const DIFF_TEXT = [
  'index 111..222 100644',
  '--- a/src/new.ts',
  '+++ b/src/new.ts',
  '@@ -1,2 +1,3 @@',
  ' const a = 1',
  '-const b = 2',
  '+const b = 3',
].join('\n')

const status: GitStatusResponse = {
  repo: true,
  root: 'E:/repo',
  error: null,
  branch: 'dev',
  upstream: 'origin/dev',
  ahead: 1,
  behind: 0,
  staged: [{ path: 'src/staged.ts', origPath: null, xy: 'M.' }],
  changes: [
    { path: 'src/new.ts', origPath: null, xy: '.M' },
    { path: 'docs/notes.md', origPath: null, xy: '??' },
  ],
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
    diff: vi.fn(async () => ({ text: DIFF_TEXT, truncated: false })),
    showFile: vi.fn(async () => ({ text: DIFF_TEXT, truncated: false })),
    branches: vi.fn(async () => ({ repo: true, names: ['dev', 'main'], error: null })),
    checkout: vi.fn(async () => ({ detail: '' })),
    createBranch: vi.fn(async () => ({ detail: '' })),
    show: vi.fn(async () => ({
      repo: true, root: 'E:/repo', error: null,
      commit: {
        hash: 'h1', shortHash: 'abc1234', parents: ['h0'], subject: '整理 Git 面板',
        author: 'dev', date: '2026-09-11 10:00:00 +0800', refs: 'HEAD -> dev',
      },
      files: [
        { path: 'src/client/GitBody.tsx', origPath: null, status: 'M' },
        { path: 'src/client/lib/diff.ts', origPath: null, status: 'A' },
      ],
    })),
    lastMessage: vi.fn(async () => ({ message: '上一条提交信息' })),
    discard: vi.fn(async () => ({ detail: '' })),
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
    expect(statusLetter('UU')).toBe('!')
    expect(statusLetter('DD')).toBe('!')
    expect(statusKind('??')).toBe('added')
    expect(statusKind('UU')).toBe('conflict')
    expect(statusKind('D ')).toBe('deleted')
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

  it('classifies diff lines', () => {
    expect(parseDiffLines(DIFF_TEXT).map(line => line.kind))
      .toEqual(['meta', 'meta', 'meta', 'hunk', 'context', 'del', 'add'])
    expect(parseDiffLines('')).toEqual([])
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

  it('switches the commit action and prefills the previous message for amend', async () => {
    const lastMessage = vi.fn(async () => ({ message: '上一条提交信息' }))
    render(<GitBody {...props({ api: api({ lastMessage }) })} />)
    fireEvent.click(await screen.findByRole('button', { name: '选择提交方式' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '提交(修改)' }))
    await waitFor(() => expect(lastMessage).toHaveBeenCalledWith('E:/repo'))
    await waitFor(() => {
      expect((screen.getByLabelText('提交信息（Ctrl+Enter 提交）') as HTMLTextAreaElement).value).toBe('上一条提交信息')
    })
    expect(screen.getByRole('button', { name: '提交(修改)' })).toBeTruthy()
  })

  it('commits with the chosen action and clears the message', async () => {
    const commit = vi.fn(async () => ({ shortHash: 'abc1234', detail: '' }))
    render(<GitBody {...props({ api: api({ commit }) })} />)
    const input = await screen.findByLabelText('提交信息（Ctrl+Enter 提交）')
    fireEvent.change(input, { target: { value: '整理 Git 面板' } })
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await waitFor(() => expect(commit).toHaveBeenCalledWith('E:/repo', '整理 Git 面板', false))
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''))
  })

  it('drafts the message with the session model and stages a changed file', async () => {
    const message = vi.fn(async () => ({ message: '草稿：整理 Git 面板', provider: 'deepseek', model: 'chat' }))
    const stage = vi.fn(async () => ({ detail: '' }))
    render(<GitBody {...props({ api: api({ message, stage }) })} />)
    fireEvent.click(await screen.findByRole('button', { name: '用当前会话的模型生成提交信息' }))
    await waitFor(() => expect(message).toHaveBeenCalledWith('s1', 'E:/repo'))
    await waitFor(() => {
      expect((screen.getByLabelText('提交信息（Ctrl+Enter 提交）') as HTMLTextAreaElement).value).toBe('草稿：整理 Git 面板')
    })
    fireEvent.click(screen.getByRole('button', { name: '暂存 src/new.ts' }))
    await waitFor(() => expect(stage).toHaveBeenCalledWith('E:/repo', ['src/new.ts']))
  })

  it('opens the inline diff for a file and closes it again', async () => {
    const diff = vi.fn(async () => ({ text: DIFF_TEXT, truncated: false }))
    render(<GitBody {...props({ api: api({ diff }) })} />)
    fireEvent.click(await screen.findByRole('button', { name: '查看差异 src/new.ts' }))
    await waitFor(() => expect(diff).toHaveBeenCalledWith('E:/repo', 'src/new.ts', false))
    expect(await screen.findByText('+const b = 3')).toBeTruthy()
    expect(screen.getByText('-const b = 2')).toBeTruthy()
    // 差异容器带 data-path，可精确定位（「工作区」在底部栏也会出现）。
    const container = document.querySelector('[data-path="src/new.ts"]')
    expect(container?.textContent).toContain('工作区')
    fireEvent.click(screen.getByRole('button', { name: '关闭差异' }))
    await waitFor(() => expect(screen.queryByText('+const b = 3')).toBeNull())
  })

  it('requires a second click before discarding a change, and hides it for untracked files', async () => {
    const discard = vi.fn(async () => ({ detail: '' }))
    render(<GitBody {...props({ api: api({ discard }) })} />)
    // 未跟踪文件不给丢弃入口，避免误删尚未纳入版本控制的文件。
    expect(await screen.findByText('notes.md')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '丢弃改动 docs/notes.md' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '丢弃改动 src/new.ts' }))
    expect(discard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '再次点击确认丢弃 src/new.ts' }))
    await waitFor(() => expect(discard).toHaveBeenCalledWith('E:/repo', ['src/new.ts']))
  })

  it('refreshes the status when the session writes files', async () => {
    let push: (() => void) | undefined
    const files: WorkspaceChangeFace = {
      changes: async function* () {
        await new Promise<void>((resolve) => { push = resolve })
        yield { kind: 'write', path: 'E:/repo/src/new.ts' }
      },
    }
    const statusCall = vi.fn(async () => status)
    render(<GitBody {...props({ api: api({ status: statusCall }), files })} />)
    await waitFor(() => expect(statusCall).toHaveBeenCalledTimes(1))
    push?.()
    await waitFor(() => expect(statusCall).toHaveBeenCalledTimes(2), { timeout: 3000 })
  })

  it('opens the commit detail with its changed files', async () => {
    const show = vi.fn(async () => ({
      repo: true, root: 'E:/repo', error: null,
      commit: {
        hash: 'h1', shortHash: 'abc1234', parents: ['h0', 'h9'], subject: '整理 Git 面板',
        author: 'dev', date: '2026-09-11 10:00:00 +0800', refs: 'HEAD -> dev',
      },
      files: [
        { path: 'src/client/GitBody.tsx', origPath: null, status: 'M' },
        { path: 'src/client/lib/diff.ts', origPath: 'src/old.ts', status: 'R' },
      ],
    }))
    render(<GitBody {...props({ api: api({ show }) })} />)
    fireEvent.click(await screen.findByRole('button', { name: '查看提交详情 abc1234' }))
    await waitFor(() => expect(show).toHaveBeenCalledWith('E:/repo', 'h1'))
    const container = await waitFor(() => {
      const found = document.querySelector('[data-commit="h1"]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    expect(container.textContent).toContain('GitBody.tsx')
    expect(container.textContent).toContain('diff.ts')
    expect(container.textContent).toContain('src/old.ts → ')
    expect(container.textContent).toContain('合并提交（2 个父提交）')
    fireEvent.click(screen.getByRole('button', { name: '关闭提交详情' }))
    await waitFor(() => expect(document.querySelector('[data-commit="h1"]')).toBeNull())
  })

  it('switches and creates branches from the bottom bar menu', async () => {
    const branches = vi.fn(async () => ({ repo: true, names: ['dev', 'main'], error: null }))
    const checkout = vi.fn(async () => ({ detail: '' }))
    const createBranch = vi.fn(async () => ({ detail: '' }))
    render(<GitBody {...props({ api: api({ branches, checkout, createBranch }) })} />)
    fireEvent.click(await screen.findByRole('button', { name: '切换分支' }))
    await waitFor(() => expect(branches).toHaveBeenCalledWith('E:/repo'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'main' }))
    await waitFor(() => expect(checkout).toHaveBeenCalledWith('E:/repo', 'main'))
    fireEvent.click(screen.getByRole('button', { name: '切换分支' }))
    const input = await screen.findByLabelText('新建分支名')
    fireEvent.change(input, { target: { value: 'feature/panel' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(createBranch).toHaveBeenCalledWith('E:/repo', 'feature/panel'))
  })

  it('opens the diff of one file inside a commit', async () => {
    const showFile = vi.fn(async () => ({ text: DIFF_TEXT, truncated: false }))
    render(<GitBody {...props({ api: api({ showFile }) })} />)
    fireEvent.click(await screen.findByRole('button', { name: '查看提交详情 abc1234' }))
    fireEvent.click(await screen.findByRole('button', { name: '查看差异 src/client/GitBody.tsx' }))
    await waitFor(() => expect(showFile).toHaveBeenCalledWith('E:/repo', 'h1', 'src/client/GitBody.tsx'))
    expect(await screen.findByText('该提交')).toBeTruthy()
    expect(screen.getByText('+const b = 3')).toBeTruthy()
  })

  it('shows branch, workspace and account in the bottom bar', async () => {
    render(<GitBody {...props()} />)
    const branch = await screen.findByRole('button', { name: '切换分支' })
    expect(branch.textContent).toContain('dev')
    expect(branch.textContent).toContain('↑1')
    expect(screen.getByTitle('repo')).toBeTruthy()
    expect(screen.getByTitle('dev · dev@example.test')).toBeTruthy()
  })
})
