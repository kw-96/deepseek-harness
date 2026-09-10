import type { McpServerInput, McpServerRecord } from '../types.js'

/** MCP 表单的暂存字段。 */
export interface McpFormState {
  serverName: string
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  cwd: string
  url: string
  env: string
  headers: string
  toolCallTimeoutMs: string
  enabled: boolean
}

/** 生成空白表单，默认使用本地进程传输。 */
export function emptyMcpForm(): McpFormState {
  return {
    serverName: '', transport: 'stdio', command: '', args: '', cwd: '', url: '',
    env: '', headers: '', toolCallTimeoutMs: '', enabled: true,
  }
}

/** 把一条记录回填为可编辑表单。 */
export function formFromRecord(record: McpServerRecord): McpFormState {
  return {
    serverName: record.serverName,
    transport: record.transport,
    command: record.command ?? '',
    args: record.args.join(' '),
    cwd: record.cwd ?? '',
    url: record.url ?? '',
    env: formatKeyValues(record.env),
    headers: formatKeyValues(record.headers),
    toolCallTimeoutMs: record.toolCallTimeoutMs === null ? '' : String(record.toolCallTimeoutMs),
    enabled: !record.disabled,
  }
}

/** 把表单暂存内容转换为提交输入。 */
export function inputFromForm(form: McpFormState): McpServerInput {
  const stdio = form.transport === 'stdio'
  return {
    serverName: form.serverName.trim(),
    transport: form.transport,
    command: stdio ? form.command.trim() : null,
    args: stdio ? splitArgs(form.args) : [],
    env: stdio ? parseKeyValues(form.env) : {},
    cwd: stdio ? (form.cwd.trim() === '' ? null : form.cwd.trim()) : null,
    url: stdio ? null : form.url.trim(),
    headers: stdio ? {} : parseKeyValues(form.headers),
    toolCallTimeoutMs: form.toolCallTimeoutMs.trim() === '' ? null : Number(form.toolCallTimeoutMs),
  }
}

/** 按空白拆分参数。 */
function splitArgs(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean)
}

/** 解析每行 KEY=VALUE 的记录。 */
function parseKeyValues(text: string): Record<string, string> {
  const record: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    if (key !== '') record[key] = value
  }
  return record
}

/** 把记录序列化为每行 KEY=VALUE 文本。 */
function formatKeyValues(record: Readonly<Record<string, string>>): string {
  return Object.entries(record).map(([key, value]) => `${key}=${value}`).join('\n')
}
