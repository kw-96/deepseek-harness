/**
 * 市场插件分类：按条目关键词离线派生一个功能分类，供列表分组与详情展示使用。
 * 分类是派生态而非存储态——目录数据（catalog v2）不新增字段，也不触发重新联网扫描。
 * @module @ruihuahe/dsh-plugin-marketplace/category
 */

/** 市场插件的功能分类 id，同时是展示分组与排序依据。 */
export type CatalogCategory =
  | 'agent' | 'tool' | 'ui' | 'mcp' | 'skill' | 'llm'
  | 'workflow' | 'memory' | 'web' | 'cost' | 'security' | 'plugin-manager' | 'other'

/** 界面分组展示顺序（other 兜底不参与展示排序）。 */
export const CATEGORY_DISPLAY_ORDER: readonly CatalogCategory[] = [
  'agent', 'tool', 'ui', 'mcp', 'skill', 'llm', 'workflow', 'memory', 'web', 'cost', 'security', 'plugin-manager', 'other',
]

/** 每个分类命中的关键词表（精确匹配）；词越具体分类优先级越高。 */
const CATEGORY_KEYWORDS: Readonly<Record<CatalogCategory, readonly string[]>> = {
  agent: ['agent', 'ai-agent', 'ai-agents', 'agents', 'multi-agent', 'agent-skills', 'coding-agent', 'agentic', 'subagent'],
  tool: ['tool', 'tools', 'cli', 'terminal', 'git', 'ocr', 'bridge', 'developer-tools', 'codex', 'opencode', 'claude-code', 'awesome-list'],
  ui: ['ui', 'web-ui', 'theme', 'skin', 'layout', 'electron', 'desktop-app', 'frontend', 'visual', 'icon'],
  mcp: ['mcp', 'model-context-protocol'],
  skill: ['skill', 'skills'],
  llm: ['llm', 'llm-api', 'model', 'models', 'provider', 'multimodal', 'vision', 'inference', 'reasoning'],
  workflow: ['workflow', 'automation', 'pipeline', 'orchestration'],
  memory: ['memory', 'rag', 'storage', 'database', 'knowledge', 'retrieval'],
  web: ['web', 'browser', 'fetch', 'crawler', 'search', 'http'],
  cost: ['usage', 'token', 'token-usage', 'billing', 'balance', 'cost', 'quota', 'budget'],
  security: ['security', 'audit', 'observability', 'evidence', 'provenance', 'privacy', 'sandbox', 'permissions'],
  'plugin-manager': ['plugin-manager', 'plugin-management', 'marketplace', 'registry'],
  other: [],
}

/** 同分时按此顺序破平：越具体、越少歧义的分类越靠前。 */
const CATEGORY_PRIORITY: readonly CatalogCategory[] = [
  'mcp', 'plugin-manager', 'memory', 'workflow', 'cost', 'security', 'web', 'skill', 'llm', 'ui', 'agent', 'tool',
]

/**
 * 按关键词打分派生分类：命中数最多者胜出，同分按分类优先级破平，零命中归入 other。
 * @param keywords - 目录条目携带的关键词（发布者/仓库主题）。
 * @returns 派生的功能分类 id。
 */
export function deriveCategory(keywords: readonly string[]): CatalogCategory {
  const scores = new Map<CatalogCategory, number>()
  for (const keyword of keywords) {
    for (const [category, rules] of Object.entries(CATEGORY_KEYWORDS) as ReadonlyArray<readonly [CatalogCategory, readonly string[]]>) {
      if (rules.includes(keyword)) scores.set(category, (scores.get(category) ?? 0) + 1)
    }
  }
  let best: CatalogCategory = 'other'
  let bestScore = 0
  for (const category of CATEGORY_PRIORITY) {
    const score = scores.get(category) ?? 0
    if (score > bestScore) {
      best = category
      bestScore = score
    }
  }
  return bestScore > 0 ? best : 'other'
}

/** 分类的本地化显示名（界面按 locale 选取）。 */
export const CATEGORY_LABELS: Readonly<Record<CatalogCategory, { 'zh-CN': string; en: string }>> = {
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
