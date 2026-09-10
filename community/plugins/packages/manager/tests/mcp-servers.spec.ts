import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  listMcpServers, removeMcpServer, saveMcpServer, setMcpServerEnabled,
} from '../src/host/mcp-servers.js'
import type { ProfileLocation } from '../src/host/profile-patches.js'
import type { McpServerInput } from '../src/types.js'

async function location(): Promise<ProfileLocation> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-plugin-manager-mcp-'))
  return { directory, filename: join(directory, 'cordis.patch.yml'), profileName: 'web' }
}

function stdio(serverName: string, command = 'node', enabled = true): McpServerInput {
  return {
    serverName, transport: 'stdio', command, args: ['server.js'], env: { KEY: 'VALUE' },
    cwd: 'C:/work', url: null, headers: {}, toolCallTimeoutMs: 30_000,
  }
}

function http(serverName: string, url = 'https://example.test/mcp', enabled = true): McpServerInput {
  return {
    serverName, transport: 'streamable-http', command: null, args: [], env: {},
    cwd: null, url, headers: { Authorization: 'Bearer t' }, toolCallTimeoutMs: null,
  }
}

describe('MCP server patch rows', () => {
  it('creates a marked stdio row and lists it back', async () => {
    const loc = await location()
    const receipt = await saveMcpServer(loc, stdio('memorix'), true)
    expect(receipt.status).toBe('changed')
    const snapshot = await listMcpServers(loc)
    expect(snapshot.servers).toHaveLength(1)
    expect(snapshot.servers[0]).toMatchObject({
      id: 'mcp-memorix', serverName: 'memorix', transport: 'stdio', command: 'node',
      disabled: false, managed: true,
    })
    const source = await readFile(loc.filename, 'utf8')
    expect(source).toContain('name: "@deepseek-ai/dsh-mcp-client"')
    expect(source).toContain('Managed by dsh-plugin-manager')
    expect(source).toContain('serverName: memorix')
  })

  it('updates an existing managed row without duplicating it', async () => {
    const loc = await location()
    await saveMcpServer(loc, stdio('memorix'), true)
    await saveMcpServer(loc, http('memorix', 'https://example.test/mcp2'), false)
    const snapshot = await listMcpServers(loc)
    expect(snapshot.servers).toHaveLength(1)
    expect(snapshot.servers[0]).toMatchObject({
      transport: 'streamable-http', url: 'https://example.test/mcp2', disabled: true,
    })
    const source = await readFile(loc.filename, 'utf8')
    expect(source.match(/name: "@deepseek-ai\/dsh-mcp-client"/g)).toHaveLength(1)
  })

  it('toggles enablement and removes managed rows', async () => {
    const loc = await location()
    await saveMcpServer(loc, stdio('memorix'), true)
    const disabled = await setMcpServerEnabled(loc, 'memorix', false)
    expect(disabled.status).toBe('changed')
    expect(disabled.snapshot.servers[0]?.disabled).toBe(true)
    const removed = await removeMcpServer(loc, 'memorix')
    expect(removed.status).toBe('removed')
    expect((await listMcpServers(loc)).servers).toHaveLength(0)
  })

  it('lists user-authored rows read-only and refuses to touch them', async () => {
    const loc = await location()
    await writeFile(loc.filename, '- id: mcp-custom\n  name: "@deepseek-ai/dsh-mcp-client"\n  config:\n    serverName: custom\n    transport: stdio\n    command: npx\n  disabled: false\n', 'utf8')
    const snapshot = await listMcpServers(loc)
    expect(snapshot.servers[0]).toMatchObject({ serverName: 'custom', managed: false })
    const refused = await saveMcpServer(loc, stdio('custom'), true)
    expect(refused.status).toBe('failed')
    expect(refused.message).toContain('非本管家维护')
    expect((await listMcpServers(loc)).servers).toHaveLength(1)
  })

  it('rejects invalid server names, commands, urls, and timeouts', async () => {
    const loc = await location()
    const cases: McpServerInput[] = [
      { ...stdio('bad name'), serverName: 'bad name' },
      { ...stdio('nocommand'), command: '  ' },
      { ...http('nourl'), url: 'ftp://example.test/mcp' },
      { ...stdio('negativetimeout'), toolCallTimeoutMs: -5 },
    ]
    for (const input of cases) {
      const receipt = await saveMcpServer(loc, input, true)
      expect(receipt.status).toBe('failed')
    }
    expect((await listMcpServers(loc)).servers).toHaveLength(0)
  })

  it('removing an unknown or unmanaged server fails without touching the file', async () => {
    const loc = await location()
    const unknown = await removeMcpServer(loc, 'ghost')
    expect(unknown.status).toBe('failed')
    await writeFile(loc.filename, '- id: mcp-custom\n  name: "@deepseek-ai/dsh-mcp-client"\n  config:\n    serverName: custom\n    transport: stdio\n    command: npx\n', 'utf8')
    const unmanaged = await removeMcpServer(loc, 'custom')
    expect(unmanaged.status).toBe('failed')
    expect(unmanaged.message).toContain('不是本管家维护')
    expect((await listMcpServers(loc)).servers).toHaveLength(1)
  })
})
