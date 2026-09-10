// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dirName } from '../../src/client/panels/files/FilesPanel.js'
import { FilesPanel } from '../../src/client/panels/files/FilesPanel.js'
import { FilesTimeline } from '../../src/client/panels/files/FilesTimeline.js'
import type { CodexApi } from '../../src/client/RightPanel.js'
import { zh } from '../../src/client/locales.js'

const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

afterEach(cleanup)

describe('codex-shell files dir helpers', () => {
  it('extracts the trailing directory name', () => {
    expect(dirName('E:\\repo\\src')).toBe('src')
    expect(dirName('E:\\repo')).toBe('repo')
    expect(dirName('E:\\')).toBe('E:')
    expect(dirName('C:\\')).toBe('C:')
    expect(dirName('/usr/lib/')).toBe('lib')
  })
})

describe('codex-shell files panel layout', () => {
  it('drops the path crumbs, shows the search bar first and the root dir name', async () => {
    const api = {
      fsList: vi.fn(async (path: string) => ({
        entries: path === 'E:\\repo'
          ? [
              { name: 'src', kind: 'directory', size: null },
              { name: 'readme.md', kind: 'file', size: 12 },
            ]
          : [{ name: 'inner.ts', kind: 'file', size: 1 }],
        truncated: false,
      })),
      fsRead: vi.fn(async () => ({ kind: 'text', content: 'hi', truncated: false })),
      gitLog: vi.fn(async () => ({ entries: [] })),
    } as unknown as CodexApi
    render(<FilesPanel api={api} t={t} cwd={'E:\\repo'} />)
    expect(await screen.findByText('repo')).toBeTruthy()
    expect(await screen.findByText('readme.md')).toBeTruthy()
    // 打开面板即自动展开第一层子目录，子条目直接可见（树形）。
    expect(await screen.findByText('inner.ts')).toBeTruthy()
    // 搜索栏位于根目录标题行之前（顶部）。
    const search = screen.getByLabelText('搜索')
    expect(search.compareDocumentPosition(screen.getByText('repo')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 顶部不再渲染完整路径屑，也没有向上导航按钮。
    expect(screen.queryByText('E:\\repo')).toBeNull()
    expect(screen.queryByRole('button', { name: '上一级' })).toBeNull()
  })

  it('auto-expands the first level, then collapses and re-expands in place', async () => {
    const fsList = vi.fn(async (path: string) => ({
      entries: path === 'E:\\repo'
        ? [
            { name: 'src', kind: 'directory', size: null },
            { name: 'top.md', kind: 'file', size: 2 },
          ]
        : [{ name: 'a.ts', kind: 'file', size: 1 }],
      truncated: false,
    }))
    const api = {
      fsList,
      fsRead: vi.fn(async () => ({ kind: 'text', content: '', truncated: false })),
      gitLog: vi.fn(async () => ({ entries: [] })),
    } as unknown as CodexApi
    render(<FilesPanel api={api} t={t} cwd={'E:\\repo'} />)
    // 打开面板即自动展开第一层子目录，树形直接可见。
    expect(await screen.findByText('a.ts')).toBeTruthy()
    expect(screen.getByText('top.md')).toBeTruthy()
    expect(fsList).toHaveBeenCalledWith('E:\\repo\\src')
    // 收起 src：子条目从树中移除，根层文件仍在。
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => expect(screen.queryByText('a.ts')).toBeNull())
    expect(screen.getByText('top.md')).toBeTruthy()
    // 再次展开 src：缓存命中，子条目重现。
    fireEvent.click(screen.getByText('src'))
    expect(await screen.findByText('a.ts')).toBeTruthy()
    expect(fsList).toHaveBeenCalledTimes(2)
  })
})

describe('codex-shell files timeline', () => {
  it('asks gitLog for the selected file and falls back to the whole repo', async () => {
    const gitLog = vi.fn(async () => ({
      entries: [{ hash: 'abc1234', subject: '整理文件面板', author: 'dev', date: '2026-09-08 10:00:00 +0800', refs: '' }],
    }))
    const api = { gitLog } as unknown as CodexApi
    const view = render(<FilesTimeline api={api} cwd={'E:\\repo'} path={'E:\\repo\\src\\a.ts'} t={t} />)
    await waitFor(() => expect(gitLog).toHaveBeenCalledWith('E:\\repo', 30, 'E:\\repo\\src\\a.ts'))
    expect(await screen.findByText('整理文件面板')).toBeTruthy()
    expect(screen.getByText('时间线')).toBeTruthy()
    expect(screen.getByText('a.ts')).toBeTruthy()
    view.unmount()
    cleanup()
    gitLog.mockClear()
    render(<FilesTimeline api={api} cwd={'E:\\repo'} path={null} t={t} />)
    await waitFor(() => expect(gitLog).toHaveBeenCalledWith('E:\\repo', 30, undefined))
    expect(screen.getByText('工作区')).toBeTruthy()
  })
})

