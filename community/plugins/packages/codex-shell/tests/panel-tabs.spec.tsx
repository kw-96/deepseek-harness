// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TabBar, type TabBarTab } from '../src/client/panel-tabs.js'
import type { PanelKind } from '../src/client/panel-controller.js'
import { zh } from '../src/client/locales.js'

const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

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
})
