/**
 * MCP 服务行的 profile patch 持久化：只维护带本管家标记的
 * `@deepseek-ai/dsh-mcp-client` 行，用户手写行只读展示、绝不改写。
 * @module dsh-plugin-manager/mcp-servers
 */

import { isMap, isSeq, type Document, type YAMLMap, type YAMLSeq } from 'yaml'
import { atomicWrite, OWNER_MARKER, readDocument, type ProfileLocation } from './profile-patches.js'
import type { McpMutationReceipt, McpServerInput, McpServerRecord, McpServersSnapshot } from '../types.js'

const MCP_MODULE = '@deepseek-ai/dsh-mcp-client'
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** 由服务名推导稳定 patch 行 id。 */
export function mcpConfigId(serverName: string): string {
  return `mcp-${serverName}`
}

function scalarString(map: YAMLMap, key: string): string | undefined {
  const value = map.get(key)
  return typeof value === 'string' ? value : undefined
}

function scalarNumber(map: YAMLMap, key: string): number | undefined {
  const value = map.get(key)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringRecord(map: unknown): Record<string, string> {
  const record: Record<string, string> = {}
  if (!isMap(map)) return record
  for (const pair of map.items) {
    if (pair === null) continue
    const key = pair.key
    const value = pair.value
    if (typeof key === 'string' && typeof value === 'string') record[key] = value
  }
  return record
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

interface McpRowView {
  readonly id: string
  readonly disabled: boolean
  readonly managed: boolean
  readonly config: YAMLMap
  readonly patch: YAMLMap
}

/** 提取一条 mcp-client 行；非 mcp 行返回 undefined。 */
function mcpRow(item: YAMLMap): McpRowView | undefined {
  if (scalarString(item, 'name') !== MCP_MODULE) return undefined
  const id = scalarString(item, 'id')
  if (id === undefined || !id.startsWith('mcp-')) return undefined
  const config = item.get('config')
  if (!isMap(config)) return undefined
  const managed = item.commentBefore?.includes(OWNER_MARKER) === true
  return { id, disabled: item.get('disabled') === true, managed, config, patch: item }
}

/** 把一条 patch 行投射成远端记录；结构不完整时返回 null（忽略而非报错）。 */
function recordFrom(row: McpRowView): McpServerRecord | null {
  const serverName = scalarString(row.config, 'serverName')
  const transport = scalarString(row.config, 'transport')
  if (serverName === undefined || (transport !== 'stdio' && transport !== 'streamable-http')) return null
  return {
    id: row.id,
    serverName,
    transport,
    command: transport === 'stdio' ? scalarString(row.config, 'command') ?? null : null,
    args: stringList(row.config.get('args')),
    env: stringRecord(row.config.get('env')),
    cwd: transport === 'stdio' ? scalarString(row.config, 'cwd') ?? null : null,
    url: transport === 'streamable-http' ? scalarString(row.config, 'url') ?? null : null,
    headers: stringRecord(row.config.get('headers')),
    toolCallTimeoutMs: scalarNumber(row.config, 'toolCallTimeoutMs') ?? null,
    disabled: row.disabled,
    managed: row.managed,
  }
}

async function sequenceOf(location: ProfileLocation): Promise<{ document: Document.Parsed; sequence: YAMLSeq }> {
  const document = await readDocument(location.filename)
  if (!isSeq(document.contents)) throw new Error(`${location.filename} must contain a YAML sequence of patches`)
  return { document, sequence: document.contents }
}

/** 列出 profile 中全部 mcp-client 行（含用户手写行）。 */
export async function listMcpServers(location: ProfileLocation): Promise<McpServersSnapshot> {
  const { sequence } = await sequenceOf(location)
  const servers: McpServerRecord[] = []
  for (const item of sequence.items) {
    if (!isMap(item)) continue
    const row = mcpRow(item)
    if (row === undefined) continue
    const record = recordFrom(row)
    if (record !== null) servers.push(record)
  }
  return { profileName: location.profileName, servers }
}

/** 校验一条提交：名称唯一、按传输要求必需字段齐全。 */
function validate(input: McpServerInput): void {
  if (!SERVER_NAME_PATTERN.test(input.serverName)) {
    throw new Error('MCP 服务名必须由 1-32 位字母、数字、下划线或连字符组成。')
  }
  if (input.transport === 'stdio') {
    if (input.command === null || input.command.trim() === '') throw new Error('stdio 传输需要启动命令。')
  } else if (input.url === null || !/^https?:\/\//.test(input.url)) {
    throw new Error('HTTP 传输需要以 http:// 或 https:// 开头的端点。')
  }
  if (input.toolCallTimeoutMs !== null && (!Number.isInteger(input.toolCallTimeoutMs) || input.toolCallTimeoutMs <= 0)) {
    throw new Error('调用超时必须为正整数毫秒。')
  }
}

function inputConfig(input: McpServerInput): Record<string, unknown> {
  if (input.transport === 'stdio') {
    return {
      serverName: input.serverName,
      transport: 'stdio' as const,
      command: input.command as string,
      args: [...input.args],
      env: { ...input.env },
      ...(input.cwd === null ? {} : { cwd: input.cwd }),
      ...(input.toolCallTimeoutMs === null ? {} : { toolCallTimeoutMs: input.toolCallTimeoutMs }),
    }
  }
  return {
    serverName: input.serverName,
    transport: 'streamable-http' as const,
    url: input.url as string,
    headers: { ...input.headers },
    ...(input.toolCallTimeoutMs === null ? {} : { toolCallTimeoutMs: input.toolCallTimeoutMs }),
  }
}

/** 新增或更新一条本管家维护的 MCP 服务行。 */
export async function saveMcpServer(
  location: ProfileLocation,
  input: McpServerInput,
  enabled: boolean,
): Promise<McpMutationReceipt> {
  try {
    validate(input)
    const id = mcpConfigId(input.serverName)
    const { document, sequence } = await sequenceOf(location)
    const existing = sequence.items.find((item): item is YAMLMap => isMap(item) && mcpRow(item)?.id === id)
    if (existing !== undefined) {
      const row = mcpRow(existing)
      if (row === undefined || !row.managed) {
        throw new Error(`MCP 服务 ${input.serverName} 存在非本管家维护的配置行，请手动编辑 profile 的 cordis.patch.yml。`)
      }
      existing.set('config', document.createNode(inputConfig(input)))
      existing.set('disabled', !enabled)
    } else {
      const patch = document.createNode({
        id,
        name: MCP_MODULE,
        config: inputConfig(input),
        disabled: !enabled,
      }) as never
      sequence.add(patch)
      const added = sequence.items.at(-1)
      if (!isMap(added)) throw new Error('failed to create an MCP YAML patch row')
      added.commentBefore = OWNER_MARKER
    }
    await atomicWrite(location.filename, String(document))
    return { status: 'changed', message: null, snapshot: await listMcpServers(location) }
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      snapshot: await listMcpServers(location).catch(() => ({ profileName: location.profileName, servers: [] })),
    }
  }
}

/** 删除一条本管家维护的 MCP 服务行。 */
export async function removeMcpServer(location: ProfileLocation, serverName: string): Promise<McpMutationReceipt> {
  try {
    const id = mcpConfigId(serverName)
    const { document, sequence } = await sequenceOf(location)
    const target = sequence.items.find((item): item is YAMLMap => isMap(item) && mcpRow(item)?.id === id)
    if (target === undefined) throw new Error(`未找到 MCP 服务 ${serverName}。`)
    const row = mcpRow(target)
    if (row !== undefined && !row.managed) throw new Error(`MCP 服务 ${serverName} 不是本管家维护的配置行。`)
    sequence.items = sequence.items.filter(item => item !== target)
    await atomicWrite(location.filename, String(document))
    return { status: 'removed', message: null, snapshot: await listMcpServers(location) }
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      snapshot: await listMcpServers(location).catch(() => ({ profileName: location.profileName, servers: [] })),
    }
  }
}

/** 启停一条本管家维护的 MCP 服务行。 */
export async function setMcpServerEnabled(
  location: ProfileLocation,
  serverName: string,
  enabled: boolean,
): Promise<McpMutationReceipt> {
  try {
    const id = mcpConfigId(serverName)
    const { document, sequence } = await sequenceOf(location)
    const target = sequence.items.find((item): item is YAMLMap => isMap(item) && mcpRow(item)?.id === id)
    if (target === undefined) throw new Error(`未找到 MCP 服务 ${serverName}。`)
    const row = mcpRow(target)
    if (row !== undefined && !row.managed) throw new Error(`MCP 服务 ${serverName} 不是本管家维护的配置行。`)
    target.set('disabled', !enabled)
    await atomicWrite(location.filename, String(document))
    return { status: 'changed', message: null, snapshot: await listMcpServers(location) }
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      snapshot: await listMcpServers(location).catch(() => ({ profileName: location.profileName, servers: [] })),
    }
  }
}
