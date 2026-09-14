/**
 * 逐轮模式分类：把一条用户消息判定为「本轮以什么为验收重心」。
 *
 * 分类是确定性的关键词打分，不额外调用模型：同一段输入永远得到同一结论，
 * 便于测试与事后复核（会话日志里能看到注入文本）。
 * @module dsh-mode-router/classify
 */

/** 三种验收重心，借自 routing-suite 的分类学（只取重心，不改任务与范围）。 */
export type RouteMode = 'correct' | 'experience' | 'research'

/** 一种模式的展示名、验收重心与给模型的动作要求。 */
export interface RouteModeSpec {
  /** 注入文本里的中文模式名。 */
  readonly name: string
  /** 本轮「什么算合格」的一句话。 */
  readonly center: string
  /** 给模型的动作要求（不含格式要求，避免与 persona 抢格式）。 */
  readonly directive: string
}

/** 模式元数据。 */
export const ROUTE_MODES: Record<RouteMode, RouteModeSpec> = {
  correct: {
    name: '正确性',
    center: '主体是代码/数据/接口/命令等可测量的行为，合格标准是证据链：概念→证据→结论。',
    directive: '先拿到可复核的证据（命令输出、测试结果、文件行号、接口回包）再下结论；不要用「应该没问题」替代验证。',
  },
  experience: {
    name: '体验',
    center: '主体是视觉/交互/手感/文案，合格标准是实际观感，不是代码推断。',
    directive: '先写清将要看到的画面或交互，改动后明确提示用户亲眼确认；不要只凭代码推断观感。',
  },
  research: {
    name: '研究',
    center: '主体是分析/比较/论证，合格标准是结论可复核。',
    directive: '每条结论标注来源（文件路径与行号、文档、实测命令），并区分事实与推断。',
  },
}

/** 关键词表：命中即计一分，长词优先人工维护；中英并列以适配混写。 */
const KEYWORDS: Record<RouteMode, readonly string[]> = {
  correct: [
    '修复', '报错', '错误', '异常', '失败', '崩溃', '卡住', '跑不起来', '测试', '构建', '编译', '类型',
    '接口', '数据', '脚本', '命令', '部署', '性能', '重构', '实现', '改一下', '加个',
    'fix', 'error', 'bug', 'fail', 'crash', 'test', 'build', 'compile', 'type', 'api', 'script', 'deploy',
    'refactor', 'implement',
  ],
  experience: [
    '界面', '样式', '排版', '布局', '颜色', '动效', '动画', '交互', '体验', '好看', '视觉', '手感',
    '图标', '圆角', '间距', '字体', '亮色', '暗色', '主题',
    'ui', 'ux', 'style', 'layout', 'color', 'animation', 'interaction', 'visual', 'design', 'css', 'theme',
  ],
  research: [
    '为什么', '怎么选', '哪个好', '比较', '对比', '评估', '调研', '论证', '方案', '权衡', '原理', '机制',
    '是否值得', '有什么区别', '结论', '调查', '查一下',
    'why', 'compare', 'evaluate', 'research', 'trade-off', 'tradeoff', 'approach', 'investigate', 'analysis',
  ],
}

/** 一次分类的结论。 */
export interface RouteVerdict {
  /** 命中的模式。 */
  readonly mode: RouteMode
  /** 该模式的命中次数。 */
  readonly score: number
  /** 命中的关键词，便于事后复核分类依据。 */
  readonly matched: readonly string[]
}

/** 平局与零命中时的兜底模式：日常绝大多数请求是「把东西改对」。 */
const FALLBACK_MODE: RouteMode = 'correct'

/**
 * 统计一条模式的关键词命中。
 * @param text - 小写化后的待判文本
 * @param mode - 目标模式
 * @returns 命中次数与命中词
 */
function hits(text: string, mode: RouteMode): { score: number; matched: string[] } {
  const matched: string[] = []
  for (const keyword of KEYWORDS[mode]) {
    if (text.includes(keyword)) matched.push(keyword)
  }
  return { score: matched.length, matched }
}

/**
 * 判定一条用户消息的本轮验收重心。
 * @param message - 用户消息原文
 * @returns 模式、命中次数与命中词；零命中或平局时回落 {@link ROUTE_MODES} 之外的 correct
 */
export function classifyTurn(message: string): RouteVerdict {
  const text = message.toLowerCase()
  const verdicts = (Object.keys(ROUTE_MODES) as RouteMode[])
    .map(mode => ({ mode, ...hits(text, mode) }))
  const ranked = [...verdicts].sort((left, right) => right.score - left.score)
  const best = ranked[0]
  if (best === undefined || best.score === 0) return { mode: FALLBACK_MODE, score: 0, matched: [] }
  const tied = ranked.filter(entry => entry.score === best.score)
  // 平局：优先顺序为研究 → 体验 → 正确性（结论可复核优先于改动，改动优先于兜底）。
  const winner = tied.find(entry => entry.mode === 'research')
    ?? tied.find(entry => entry.mode === 'experience')
    ?? best
  return { mode: winner.mode, score: winner.score, matched: winner.matched }
}

/**
 * 渲染注入文本：模式名、验收重心、动作要求三行。
 * @param verdict - 分类结论
 * @param note - 可选补充说明（例如开关关闭时的空串）
 * @returns 注入的动态上下文文本
 */
export function renderRouteContext(verdict: RouteVerdict, note = ''): string {
  const spec = ROUTE_MODES[verdict.mode]
  const evidence = verdict.matched.length === 0
    ? '无关键词命中，按默认重心处理'
    : `关键词：${verdict.matched.slice(0, 6).join('、')}`
  return [
    `【本轮模式路由】${spec.name}（${verdict.mode}，命中 ${verdict.score}：${evidence}）`,
    `验收重心：${spec.center}`,
    `要求：${spec.directive}`,
    note,
  ].filter(line => line.length > 0).join('\n')
}
