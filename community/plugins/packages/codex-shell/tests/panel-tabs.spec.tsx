// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TabBar, type TabBarTab } from '../src/client/panel-tabs.js'
import { GitFileList } from '../src/client/panels/git/GitFileList.js'
import { GitPanel } from '../src/client/panels/git/GitPanel.js'
import type { CodexApi } from '../src/client/RightPanel.js'
import type { PanelKind } from '../src/client/panel-controller.js'
import { zh } from '../src/client/locales.js'

const t = (key: string): string => (zh as Record<string, string>)[key] ?? key
const styles = readFileSync(resolve(process.cwd(), 'src/client/styles.module.css'), 'utf8')

const ids: readonly PanelKind[] = [
  'files', 'git', 'projects', 'plugins', 'mcp', 'skills', 'commands', 'summary', 'browser',
]

function tabs(): readonly TabBarTab[] {
  return ids.map(id => ({ id, label: t(`panel${id[0].toUpperCase()}${id.slice(1)}`), icon: <span>{id}</span> }))
}

function renderBar(active: PanelKind, onSelect = vi.fn()): ReturnType<typeof render> {
  return render(<TabBar tabs={tabs()} activeId={active} onSelect={onSelect} onClose={vi.fn()} t={t} />)
}

afterEach(cleanup)

describe('codex-shell TabBar', () => {
  it('stacks the icon bar above the panel body', () => {
    expect(styles).toMatch(/\.panel\s*\{[^}]*flex-direction:\s*column;/s)
    expect(styles).toMatch(/\.tabStrip\s*\{[^}]*justify-content:\s*flex-start;/s)
    expect(styles).toMatch(/\.tabLabel\s*\{[^}]*display:\s*none;/s)
  })

  it('shows exactly the first 5 tabs centered with the rest collapsed', () => {
    renderBar('files')
    const visible = screen.getAllByRole('tab')
    expect(visible.map(tab => tab.textContent)).toEqual([
      'files文件', 'gitGit', 'projects项目', 'plugins插件', 'mcpMCP',
    ])
    expect(screen.getByRole('button', { name: '更多标签' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '关闭面板' })).toBeTruthy()
  })

  it('swaps an active overflow tab into the fifth visible slot', () => {
    renderBar('summary')
    const visible = screen.getAllByRole('tab')
    expect(visible.map(tab => tab.textContent)).toEqual([
      'files文件', 'gitGit', 'projects项目', 'plugins插件', 'summary摘要',
    ])
  })

  it('opens the overflow menu listing the hidden tabs and selects on click', () => {
    const onSelect = vi.fn()
    renderBar('files', onSelect)
    fireEvent.click(screen.getByRole('button', { name: '更多标签' }))
    const items = screen.getAllByRole('menuitem')
    expect(items.map(item => item.textContent)).toEqual([
      'skillsSkills', 'commands命令', 'summary摘要', 'browser浏览器',
    ])
    fireEvent.click(items[0] as HTMLElement)
    expect(onSelect).toHaveBeenCalledWith('skills')
  })

  it('renders collapsible change groups with compact file paths and status', () => {
    render(
      <GitFileList
        staged={[]}
        changes={[{ path: 'community/plugins/package.json', origPath: null, xy: ' M' }]}
        clean={false}
        onShowDiff={vi.fn()}
        onStage={vi.fn()}
        onUnstage={vi.fn()}
        onDiscard={vi.fn()}
        t={t}
      />,
    )
    expect(screen.getByText('package.json')).toBeTruthy()
    expect(screen.getByText('community/plugins/')).toBeTruthy()
    expect(screen.getByLabelText('M')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /更改/ }))
    expect(screen.queryByText('package.json')).toBeNull()
  })

  it('renders Git log entries as a commit timeline', async () => {
    const api = {
      gitStatus: vi.fn(async () => ({ isRepo: true, branch: 'dev', upstream: null, ahead: 0, behind: 0, entries: [] })),
      gitBranches: vi.fn(async () => ({ current: 'dev', names: ['dev'] })),
      gitLog: vi.fn(async () => ({
        entries: [{ hash: 'abc1234', subject: '整理 Git 面板', author: 'Nsh', date: new Date().toISOString(), refs: 'HEAD -> dev' }],
      })),
    } as unknown as CodexApi
    render(<GitPanel api={api} t={t} cwd="E:\\workspace" />)
    expect(await screen.findByText('整理 Git 面板')).toBeTruthy()
    expect(screen.getByText(/abc1234/)).toBeTruthy()
    expect(screen.getByText('HEAD -> dev')).toBeTruthy()
  })
})
