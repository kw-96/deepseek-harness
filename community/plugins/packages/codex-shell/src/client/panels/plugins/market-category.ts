/**
 * 市场插件的本地分类词表。与市场包（@ruihuahe/dsh-plugin-marketplace）的
 * 分类词表保持一致；跨包只共享远端数据（category 字符串），不共享代码。
 */

/** 分组展示顺序；未知分类排在 other 之后按字典序。 */
export const MARKET_CATEGORY_ORDER: readonly string[] = [
  'agent', 'tool', 'ui', 'mcp', 'skill', 'llm', 'workflow', 'memory', 'web', 'cost', 'security', 'plugin-manager', 'other',
]

/** 分类 id → 本地化显示名。 */
export const MARKET_CATEGORY_LABELS: Readonly<Record<string, { 'zh-CN': string; en: string }>> = {
  agent: { 'zh-CN': '智能体', en: 'Agents' },
  tool: { 'zh-CN': '工具', en: 'Tools' },
  ui: { 'zh-CN': '界面与主题', en: 'UI & Theme' },
  mcp: { 'zh-CN': 'MCP 服务', en: 'MCP' },
  skill: { 'zh-CN': '技能', en: 'Skills' },
  llm: { 'zh-CN': '模型', en: 'Models' },
  workflow: { 'zh-CN': '工作流', en: 'Workflow' },
  memory: { 'zh-CN': '记忆与存储', en: 'Memory & Storage' },
  web: { 'zh-CN': '网络', en: 'Web' },
  cost: { 'zh-CN': '用量与计费', en: 'Usage & Cost' },
  security: { 'zh-CN': '安全', en: 'Security' },
  'plugin-manager': { 'zh-CN': '插件管理', en: 'Plugin Management' },
  other: { 'zh-CN': '其他', en: 'Other' },
}

/** 按当前界面语言取分类显示名；未知分类回退为分类 id 本身。 */
export function marketCategoryLabel(category: string, locale: string): string {
  const labels = MARKET_CATEGORY_LABELS[category]
  return labels === undefined ? category : labels[locale === 'zh-CN' ? 'zh-CN' : 'en']
}

/** 按分类分组条目，保持既定展示顺序；未知分类归入 other。 */
export function groupMarketEntries<T extends { category: string }>(entries: readonly T[]): readonly { category: string; entries: T[] }[] {
  const byCategory = new Map<string, T[]>()
  for (const entry of entries) {
    const list = byCategory.get(entry.category) ?? []
    list.push(entry)
    byCategory.set(entry.category, list)
  }
  const known = MARKET_CATEGORY_ORDER.filter(category => byCategory.has(category))
  const unknown = [...byCategory.keys()].filter(category => !MARKET_CATEGORY_ORDER.includes(category)).sort()
  return [...known, ...unknown].map(category => ({ category, entries: byCategory.get(category) ?? [] }))
}
