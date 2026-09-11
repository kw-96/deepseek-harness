import type { ImageMediaType } from './attachment.js'
import { BskError } from './bsk.js'

/**
 * bsk JSON 输出的解析：只保留本插件投影需要的字段，未知字段一律忽略，
 * 因此 bsk 增加字段不会影响插件。
 */

import type { BrowserInstanceView, BrowserTabView } from '../types.js'

/**
 * 解析浏览器实例列表。`bsk status --json` 把实例放在 `browsers` 字段里，
 * 而 `bsk browsers --json` 直接返回数组，两种形状都要支持。
 * @param json - 对象形态的输出
 * @param rows - 数组形态的输出
 * @returns 浏览器实例视图
 */
export function parseBrowsers(
  json: Record<string, unknown> | undefined,
  rows?: unknown[] | undefined,
): BrowserInstanceView[] {
  const raw = json?.['browsers'] ?? rows
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): BrowserInstanceView[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const item = entry as Record<string, unknown>
    return [{
      instanceId: String(item['instance_id'] ?? ''),
      browserName: String(item['browser_name'] ?? ''),
      label: String(item['label'] ?? ''),
      extensionVersion: String(item['extension_version'] ?? ''),
      versionSkew: item['version_skew'] === true,
    }]
  })
}

/**
 * 解析 `bsk session list --json` 的输出（数组形态）。
 * @param rows - 命令返回的数组
 * @returns 会话 id 列表
 */
export function parseSessions(rows: unknown[] | undefined): string[] {
  if (rows === undefined) return []
  return rows.flatMap((entry): string[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const id = (entry as Record<string, unknown>)['session_id']
    return typeof id === 'string' ? [id] : []
  })
}

/**
 * 取 `bsk tab list --json` 里活动标签页的 URL。
 *
 * 点击或按键可能让页面自行跳转，此时 `navigate` 的返回值已经过期；状态查询
 * 与面板用这个派生值给出真实 URL。
 * @param json - 命令返回的 JSON
 * @returns 活动标签页 URL；取不到时为 undefined
 */
export function activeTabUrl(json: Record<string, unknown> | undefined): string | undefined {
  const tabs = parseTabs(json)
  if (tabs.length === 0) return undefined
  const raw = json?.['tabs']
  const activeEntry = Array.isArray(raw)
    ? raw.find(entry => typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>)['active'] === true)
    : undefined
  const activeId = activeEntry === undefined
    ? undefined
    : String((activeEntry as Record<string, unknown>)['tab_id'] ?? '')
  const picked = tabs.find(tab => tab.tabId === activeId) ?? tabs[0]
  return picked === undefined || picked.url === '' ? undefined : picked.url
}

/**
 * 解析 `bsk tab list --json` 的输出。
 * @param json - 命令返回的 JSON
 * @returns 标签页列表
 */
export function parseTabs(json: Record<string, unknown> | undefined): BrowserTabView[] {
  const raw = json?.['tabs']
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): BrowserTabView[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const item = entry as Record<string, unknown>
    return [{
      tabId: String(item['tab_id'] ?? ''),
      title: String(item['title'] ?? ''),
      url: String(item['url'] ?? ''),
      scope: item['scope'] === 'user' ? 'user' : 'agent',
    }]
  })
}

/** 附件库接受的图片类型。 */
export const IMAGE_MEDIA_TYPES: readonly ImageMediaType[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/**
 * 按魔术字节识别图片类型。
 *
 * 不能信扩展声明的格式：部分 Chromium/Edge 构建的 `captureVisibleTab` 即使
 * 要求 PNG 也会返回 JPEG，声明错类型会被附件库的校验拒绝。
 * @param data - 图片字节
 * @returns 识别出的媒体类型，无法识别时为 undefined
 */
export function sniffImageMediaType(data: Uint8Array): ImageMediaType | undefined {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return 'image/png'
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (
    data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46
    && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (
    data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38
    && (data[4] === 0x37 || data[4] === 0x39) && data[5] === 0x61
  ) {
    return 'image/gif'
  }
  return undefined
}

/**
 * 从活动标签页派生真实 URL 并写回会话状态。
 *
 * 点击、按键或脚本都可能让页面自行跳转，此时 `navigate` 的返回值已经过期；
 * 观测结果里的 URL 一律以这里派生出的值为准。
 * @param deps - 工具依赖
 * @param sessionId - DSH 会话 id
 * @param signal - 取消信号
 */

/**
 * 解析 bsk 的 JSON 输出；非 JSON 时返回 undefined。
 * @param text - 命令 stdout
 * @returns 解析出的对象，或 undefined
 */
export function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return undefined
  try {
    const value: unknown = JSON.parse(trimmed)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

/** 读取字符串字段。 */
export function stringField(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key]
  return typeof value === 'string' ? value : undefined
}

/** 解析数组形态的 JSON 输出；非数组时返回 undefined。 */
export function parseJsonRows(text: string): unknown[] | undefined {
  const trimmed = text.trim()
  if (!trimmed.startsWith('[')) return undefined
  try {
    const value: unknown = JSON.parse(trimmed)
    return Array.isArray(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * 判断错误是否表示「会话已不存在」（被外部结束、daemon 重启等）。
 * 注意与引用失效区分：后者描述的是 ref，不会是 session not registered。
 * @param error - 捕获到的错误
 * @returns 会话已失效时为 true
 */
export function isStaleSessionError(error: unknown): error is BskError {
  if (!(error instanceof BskError) || error.code !== 'not_found') return false
  return /session not registered|already stopped|unknown session/i.test(error.message)
}

/** 统一的错误文本化。 */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 把 console / network 的条目压成模型可读的多行文本（每行一条）。 */
export function formatDiagnosticEntries(entries: readonly Record<string, unknown>[], kind: string): string {
  if (entries.length === 0) return '（没有记录）'
  return entries.map((entry) => {
    const seq = String(entry['sequence'] ?? '?')
    if (kind === 'console') {
      const level = String(entry['level'] ?? entry['kind'] ?? 'log')
      const where = entry['line'] !== undefined ? ` (${String(entry['line'])}:${String(entry['column'] ?? 0)})` : ''
      return `#${seq} [${level}] ${String(entry['text'] ?? '')}${where}`
    }
    const status = entry['status'] !== undefined ? ` ${String(entry['status'])}` : ''
    const failure = entry['error_text'] !== undefined ? ` ${String(entry['error_text'])}` : ''
    return `#${seq} ${String(entry['method'] ?? '')}${status}${failure} ${String(entry['url'] ?? '')}`
  }).join('\n')
}
