// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginsPanel } from '../src/client/panels/plugins/PluginsPanel.js'
import { zh } from '../src/client/locales.js'
import type { CodexMarketplace, CodexPluginManager, InventoryEntryLike, MarketEntryLike } from '../src/client/RightPanel.js'

const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

const inventory: readonly InventoryEntryLike[] = [
  {
    entryId: 'official-one', configId: 'session', packageName: '@deepseek-ai/dsh-session', category: 'official',
    group: 'session', description: '官方会话服务', enabled: true, phase: 'active', protected: false,
    protectionReason: null, error: null,
  },
  {
    entryId: 'third-party-one', configId: 'dsh-doc', packageName: 'dsh-doc', category: 'third-party',
    group: 'tool', description: '文档解析', enabled: false, phase: null, protected: true,
    protectionReason: '受保护条目', error: null,
  },
]

const market: readonly MarketEntryLike[] = [
  {
    id: 'repo/tool:.', displayName: { 'zh-CN': '工具插件', en: 'Tool Plugin' },
    summary: { 'zh-CN': '一个工具。', en: 'A tool.' }, packageName: 'dsh-tool-plugin', version: '0.1.0',
    category: 'tool', license: 'MIT', availability: 'installable', installedVersion: null,
    repositoryUrl: 'https://github.com/repo/tool',
  },
  {
    id: 'repo/mcp:.', displayName: { 'zh-CN': 'MCP 插件', en: 'MCP Plugin' },
    summary: { 'zh-CN': '一个 MCP 服务。', en: 'An MCP server.' }, packageName: 'dsh-mcp-plugin', version: '0.2.0',
    category: 'mcp', license: 'MIT', availability: 'installable', installedVersion: '0.2.0',
    repositoryUrl: 'https://github.com/repo/mcp',
  },
]

function pluginManager(overrides: Partial<CodexPluginManager> = {}): CodexPluginManager {
  return {
    list: vi.fn(async () => ({ ok: true, value: { entries: inventory } })),
    setEnabled: vi.fn(async (_entryId: string, enabled: boolean) => ({
      ok: true,
      value: {
        snapshot: { entries: inventory.map(entry => entry.entryId === 'official-one' ? { ...entry, enabled } : entry) },
      },
    })),
    ...overrides,
  }
}

function marketplace(overrides: Partial<CodexMarketplace> = {}): CodexMarketplace {
  return {
    list: vi.fn(async () => ({ ok: true, value: { entries: market } })),
    installPlugin: vi.fn(async () => ({ ok: true, value: { message: '安装完成。重启当前配置后加载插件。' } })),
    ...overrides,
  }
}

afterEach(cleanup)

describe('codex-shell PluginsPanel', () => {
  it('renders two segmented views and groups the installed inventory by category', async () => {
    render(<PluginsPanel pluginManager={pluginManager()} marketplace={marketplace()} t={t} locale="zh-CN" />)
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['已装插件 2', '插件市场 2'])
    expect(await screen.findByRole('group', { name: '官方' })).toBeTruthy()
    expect(screen.getByRole('group', { name: '第三方' })).toBeTruthy()
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('session'), expect.stringContaining('dsh-doc'),
    ]))
  })

  it('shows a docked detail pane for a selected inventory entry and toggles enablement', async () => {
    const manager = pluginManager()
    render(<PluginsPanel pluginManager={manager} marketplace={marketplace()} t={t} locale="zh-CN" />)
    const row = await screen.findByRole('listitem', { name: /@deepseek-ai\/dsh-session/ })
    fireEvent.click(row)
    const detail = screen.getByRole('dialog', { name: '插件详情' })
    expect(detail.textContent).toContain('官方会话服务')
    expect(detail.textContent).toContain('@deepseek-ai/dsh-session')
    // 列表行数在详情打开时保持不变（详情为弹层，不再挤占列表）。
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '禁用' }))
    await waitFor(() => expect(manager.setEnabled).toHaveBeenCalledWith('official-one', false))
    // 点击遮罩关闭详情弹层。
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(screen.queryByRole('dialog', { name: '插件详情' })).toBeNull()
  })

  it('groups the market by category and installs after a two-step confirm', async () => {
    const market = marketplace()
    render(<PluginsPanel pluginManager={pluginManager()} marketplace={market} t={t} locale="zh-CN" />)
    fireEvent.click((await screen.findAllByRole('tab'))[1] as HTMLElement)
    expect(await screen.findByRole('group', { name: '工具' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'MCP 服务' })).toBeTruthy()
    const row = screen.getByRole('listitem', { name: /dsh-tool-plugin/ })
    fireEvent.click(row)
    const detail = screen.getByLabelText('插件详情')
    expect(detail.textContent).toContain('MIT')
    fireEvent.click(screen.getByRole('button', { name: '安装' }))
    expect(market.installPlugin).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认安装' }))
    await waitFor(() => expect(market.installPlugin).toHaveBeenCalledWith('dsh-tool-plugin', '0.1.0'))
    expect((await screen.findByRole('status')).textContent).toContain('安装完成')
  })

  it('filters the market view with the search box', async () => {
    render(<PluginsPanel pluginManager={pluginManager()} marketplace={marketplace()} t={t} locale="zh-CN" />)
    fireEvent.click((await screen.findAllByRole('tab'))[1] as HTMLElement)
    await screen.findByRole('group', { name: '工具' })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'mcp' } })
    expect(screen.queryByRole('listitem', { name: /dsh-tool-plugin/ })).toBeNull()
    expect(screen.getByRole('listitem', { name: /dsh-mcp-plugin/ })).toBeTruthy()
  })

  it('renders the missing-manager empty state when both remotes are absent', () => {
    render(<PluginsPanel pluginManager={undefined} marketplace={undefined} t={t} locale="zh-CN" />)
    expect(screen.getByText('插件管家未安装或未挂载，该面板不可用。')).toBeTruthy()
  })
})
