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
