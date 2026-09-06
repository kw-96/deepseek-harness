// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpPanel } from '../src/client/panels/mcp/McpPanel.js'
import { zh } from '../src/client/locales.js'
import type { CodexMcpManager, McpServerLike } from '../src/client/RightPanel.js'

const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

const servers: readonly McpServerLike[] = [
  {
    id: 'mcp-memorix', serverName: 'memorix', transport: 'stdio', command: 'npx', args: ['-y', 'memorix'],
    env: { KEY: 'VALUE' }, cwd: 'C:/work', url: null, headers: {}, toolCallTimeoutMs: 30_000,
    disabled: false, managed: true,
  },
  {
    id: 'mcp-custom', serverName: 'custom', transport: 'streamable-http', command: null, args: [],
    env: {}, cwd: null, url: 'https://example.test/mcp', headers: {}, toolCallTimeoutMs: null,
    disabled: true, managed: false,
  },
]

function manager(overrides: Partial<CodexMcpManager> = {}): CodexMcpManager {
  return {
    listMcpServers: vi.fn(async () => ({ ok: true, value: { profileName: 'web', servers } })),
    saveMcpServer: vi.fn(async () => ({ ok: true, value: { status: 'changed', message: null, snapshot: { profileName: 'web', servers } } })),
    removeMcpServer: vi.fn(async () => ({ ok: true, value: { status: 'removed', message: null, snapshot: { profileName: 'web', servers: servers.filter(item => item.serverName !== 'memorix') } } })),
    setMcpServerEnabled: vi.fn(async () => ({ ok: true, value: { status: 'changed', message: null, snapshot: { profileName: 'web', servers } } })),
    ...overrides,
  }
}

afterEach(cleanup)

describe('codex-shell McpPanel', () => {
  it('lists MCP servers with transport and enablement state', async () => {
    render(<McpPanel mcpManager={manager()} t={t} />)
    const rows = await screen.findAllByRole('listitem')
    expect(rows.map(row => row.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('memorix'), expect.stringContaining('custom'),
    ]))
    expect(screen.getByRole('listitem', { name: 'memorix stdio' }).textContent).toContain('npx')
    expect(screen.getByRole('listitem', { name: 'custom streamable-http' }).textContent).toContain('https://example.test/mcp')
  })

  it('adds a stdio server through the form and validates its fields', async () => {
    const mcp = manager()
    render(<McpPanel mcpManager={mcp} t={t} />)
    await screen.findAllByRole('listitem')
    fireEvent.click(screen.getByRole('button', { name: '添加 MCP 服务' }))
    fireEvent.change(screen.getByPlaceholderText('my-server'), { target: { value: 'new-server' } })
    fireEvent.change(screen.getByPlaceholderText('npx -y @some/mcp'), { target: { value: 'node server.js' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mcp.saveMcpServer).toHaveBeenCalledWith(expect.objectContaining({
      serverName: 'new-server', transport: 'stdio', command: 'node server.js',
    }), true))
  })

  it('rejects an invalid server name before calling the remote', async () => {
    const mcp = manager()
    render(<McpPanel mcpManager={mcp} t={t} />)
    await screen.findAllByRole('listitem')
    fireEvent.click(screen.getByRole('button', { name: '添加 MCP 服务' }))
    fireEvent.change(screen.getByPlaceholderText('my-server'), { target: { value: 'bad name' } })
    fireEvent.change(screen.getByPlaceholderText('npx -y @some/mcp'), { target: { value: 'node server.js' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByText('服务名必须由 1-32 位字母、数字、下划线或连字符组成。')).toBeTruthy()
    expect(mcp.saveMcpServer).not.toHaveBeenCalled()
  })

  it('toggles a managed server and hides controls for unmanaged rows', async () => {
    const mcp = manager()
    render(<McpPanel mcpManager={mcp} t={t} />)
    await screen.findAllByRole('listitem')
    fireEvent.click(screen.getByRole('button', { name: '禁用' }))
    await waitFor(() => expect(mcp.setMcpServerEnabled).toHaveBeenCalledWith('memorix', false))
    const unmanagedRow = screen.getByRole('listitem', { name: 'custom streamable-http' })
    for (const name of ['启用', '编辑', '删除']) {
      expect(within(unmanagedRow).getByRole('button', { name })).toHaveProperty('disabled', true)
    }
  })

  it('removes a managed server after inline confirmation', async () => {
    const mcp = manager()
    render(<McpPanel mcpManager={mcp} t={t} />)
    await screen.findAllByRole('listitem')
    const managedRow = screen.getByRole('listitem', { name: 'memorix stdio' })
    fireEvent.click(within(managedRow).getByRole('button', { name: '删除' }))
    expect(mcp.removeMcpServer).not.toHaveBeenCalled()
    fireEvent.click(within(managedRow).getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(mcp.removeMcpServer).toHaveBeenCalledWith('memorix'))
  })

  it('renders the missing-manager empty state', () => {
    render(<McpPanel mcpManager={undefined} t={t} />)
    expect(screen.getByText('插件管家未挂载 MCP 能力，该面板不可用。')).toBeTruthy()
  })
})
