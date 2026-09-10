// @vitest-environment jsdom
/** 时间线标签体的渲染行为：仓库识别、提交列表、变更文件快捷选择与相对时间。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { statusLetter, timeAgo, TimelineBody, type TimelineBodyProps } from '../src/client/TimelineBody.js'
import { zh } from '../src/client/locales.js'

const t = (key: string, params?: Record<string, unknown>): string => {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template,
  )
}

const commit = {
  hash: 'abc1234', subject: '整理时间线', author: 'dev', date: '2026-09-10 10:00:00 +0800', refs: '',
}

function props(over: Partial<TimelineBodyProps> = {}): TimelineBodyProps {
  const state = { current: 's1', byId: { s1: { cwd: 'E:/repo' } } }
  return {
    sessionId: 's1',
    useSessions: ((selector: (value: typeof state) => unknown) => selector(state)) as never,
    t,
    log: vi.fn(async () => ({ repo: true, root: 'E:/repo', error: null, entries: [commit] })),
    changed: vi.fn(async () => ({
      repo: true,
      root: 'E:/repo',
      error: null,
      files: [{ path: 'src/a.ts', origPath: null, status: ' M' }],
    })),
    ...over,
  } as TimelineBodyProps
}

afterEach(cleanup)

describe('dsh-git-timeline helpers', () => {
  it('derives a single status letter from porcelain XY', () => {
    expect(statusLetter(' M')).toBe('M')
    expect(statusLetter('M ')).toBe('M')
    expect(statusLetter('??')).toBe('?')
    expect(statusLetter('R ')).toBe('R')
    expect(statusLetter('  ')).toBe('?')
  })

  it('renders relative commit times', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T12:00:00+08:00'))
    expect(timeAgo(t, '2026-09-10 11:59:30 +0800')).toBe('刚刚')
    expect(timeAgo(t, '2026-09-10 11:30:00 +0800')).toBe('30 分钟前')
    expect(timeAgo(t, '2026-09-10 09:00:00 +0800')).toBe('3 小时前')
    expect(timeAgo(t, '2026-09-08 12:00:00 +0800')).toBe('2 天前')
    expect(timeAgo(t, 'not-a-date')).toBe('')
    vi.useRealTimers()
  })
})

describe('dsh-git-timeline body', () => {
  it('lists commits for the whole repository and shows the changed-file chip', async () => {
    const p = props()
    render(<TimelineBody {...p} />)
    expect(await screen.findByText('整理时间线')).toBeTruthy()
    expect(screen.getByText(/abc1234/)).toBeTruthy()
    expect(screen.getByText('整个仓库')).toBeTruthy()
    expect(screen.getByText('src/a.ts')).toBeTruthy()
    expect(p.log).toHaveBeenCalledWith('E:/repo', '')
  })

  it('filters by the picked changed file and re-reads the log', async () => {
    const p = props()
    render(<TimelineBody {...p} />)
    fireEvent.click(await screen.findByText('src/a.ts'))
    await waitFor(() => expect(p.log).toHaveBeenCalledWith('E:/repo', 'src/a.ts'))
  })

  it('explains a non-repository workspace and an empty history', async () => {
    const notRepo = props({ log: vi.fn(async () => ({ repo: false, root: null, error: null, entries: [] })) })
    render(<TimelineBody {...notRepo} />)
    expect(await screen.findByText('当前工作区不是 Git 仓库')).toBeTruthy()
    cleanup()
    const empty = props({
      log: vi.fn(async () => ({ repo: true, root: 'E:/repo', error: 'your current branch does not have any commits yet', entries: [] })),
    })
    render(<TimelineBody {...empty} />)
    expect(await screen.findByText(/does not have any commits/)).toBeTruthy()
  })
})
