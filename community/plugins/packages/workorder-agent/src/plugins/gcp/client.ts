import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export interface GcpClientConfig {
  url: string
  host: string
  userKey: string
}

function extractResult(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  if (result.isError) {
    const detail = Array.isArray(result.content)
      ? result.content.find((item) => typeof item === 'object' && item !== null && item.type === 'text')
      : undefined
    throw new Error(`易协作 MCP 调用失败：${detail && 'text' in detail ? String(detail.text) : '未知错误'}`)
  }
  if (result.structuredContent !== undefined) return result.structuredContent
  const content = Array.isArray(result.content) ? result.content : []
  const text = content.find((item): item is { type: 'text'; text: string } => {
    return typeof item === 'object' && item !== null && item.type === 'text' && typeof item.text === 'string'
  })
  if (!text) return content
  try {
    return JSON.parse(text.text) as unknown
  } catch {
    return text.text
  }
}

/** 官方易协作 MCP 的确定性只读客户端。 */
export class GcpClient {
  private readonly client = new Client({ name: 'workorder-agent', version: '0.1.0' })
  private readonly transport: StreamableHTTPClientTransport
  private connected = false

  constructor(config: GcpClientConfig) {
    this.transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: {
        headers: {
          Accept: 'application/json, text/event-stream',
          'gcp-host': config.host,
          'gcp-user-key': config.userKey,
        },
      },
    })
  }

  /** 建立 MCP 会话。 */
  async connect(): Promise<void> {
    await this.client.connect(this.transport)
    this.connected = true
  }

  /** 返回 MCP 会话是否已成功建立且尚未关闭。 */
  isReady(): boolean {
    return this.connected
  }

  /** 调用白名单内的查询工具。 */
  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const allowed = new Set(['get_account_projects', 'list_issues', 'get_issue_base', 'list_custom_fields'])
    if (!allowed.has(name)) throw new Error(`禁止调用非只读工具：${name}`)
    return extractResult(await this.client.callTool({ name, arguments: args }))
  }

  /** 关闭 MCP 会话。 */
  async close(): Promise<void> {
    this.connected = false
    await this.client.close()
  }
}
