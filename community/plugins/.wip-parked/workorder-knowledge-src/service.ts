import { DEFAULT_REVIEW_KNOWLEDGE_BASE } from '../../config.js'
import type { KnowledgeRepository } from './repository.js'
import type { KnowledgeEntry, KnowledgeEntryInput } from './types.js'

/** 条目与内容的长度上限，避免提示词被无界撑大。 */
const MAX_TITLE = 120
const MAX_CONTENT = 2_000
const MAX_ENTRIES = 200

/** 首次使用的种子条目：把默认规范文本拆成可维护的条目。 */
const SEED: Array<{ title: string; content: string }> = [
  { title: '适用范围', content: '仅核验状态为「美术完成」且期望交付时间不早于 2026-07-26 的设计工单。' },
  { title: '子单必填字段', content: '子单必须填写所属项目对应的投放渠道、AI管线耗时、总工时和设计数量。' },
  { title: '字段取值要求', content: 'AI管线耗时只能填写「是」或「否」，总工时和设计数量必须是大于 0 的数值。' },
  { title: '总单规则', content: '总单不填写设计数量；已填写时仅提示提单人确认工单类型。' },
  { title: '审核边界', content: '审核结论必须基于工单快照和本知识库，不得猜测、修改工单或编造字段。' },
]

/** 提单规范知识库：条目化管理 + 审核提示词合成。 */
export class KnowledgeService {
  /**
   * @param repository 条目仓库
   */
  constructor(private readonly repository: KnowledgeRepository) {}

  /** 首次启动时写入种子条目；已有条目则不动。 */
  seedIfEmpty(): void {
    if (this.repository.count() > 0) return
    const seeds = SEED.length > 0 ? SEED : DEFAULT_REVIEW_KNOWLEDGE_BASE.split('\n')
      .map((line, index) => ({ title: `规范 ${index + 1}`, content: line.trim() }))
      .filter((item) => item.content !== '')
    seeds.forEach((item, index) => {
      this.repository.create({ title: item.title, content: item.content, enabled: true }, index)
    })
  }

  /** 返回全部条目（按位置）。 */
  list(): KnowledgeEntry[] {
    return this.repository.list()
  }

  /**
   * 新增条目；超出条目上限或内容过长时抛错。
   * @param input 条目标题与正文
   */
  create(input: KnowledgeEntryInput): KnowledgeEntry {
    const normalized = this.normalize(input)
    if (this.repository.count() >= MAX_ENTRIES) throw new Error(`知识库条目不能超过 ${MAX_ENTRIES} 条`)
    return this.repository.create(normalized, this.repository.count())
  }

  /**
   * 更新条目。
   * @param id 条目标识
   * @param input 条目标题与正文
   */
  update(id: string, input: KnowledgeEntryInput): KnowledgeEntry {
    const normalized = this.normalize(input)
    if (!this.repository.update(id, normalized)) throw new Error('知识条目不存在')
    return { ...this.repository.get(id) as KnowledgeEntry }
  }

  /**
   * 删除条目。
   * @param id 条目标识
   */
  remove(id: string): void {
    if (!this.repository.remove(id)) throw new Error('知识条目不存在')
  }

  /**
   * 重排条目：给定顺序在前，未列出的条目按原相对顺序排在后面。
   * @param ids 目标顺序的条目标识
   */
  reorder(ids: string[]): void {
    const all = this.repository.list().map((item) => item.id)
    const known = new Set(all)
    const moved = ids.filter((id) => known.has(id))
    this.repository.reorder([...moved, ...all.filter((id) => !moved.includes(id))])
  }

  /**
   * 合成审核提示词使用的规范文本：启用条目按位置拼接，一条一行。
   * 全部停用时回退到默认规范，避免模型失去判定依据。
   */
  compose(): string {
    const lines = this.repository.composeEnabled(true)
    if (lines.length === 0) return DEFAULT_REVIEW_KNOWLEDGE_BASE
    return lines.map((line) => `- ${line}`).join('\n')
  }

  private normalize(input: KnowledgeEntryInput): KnowledgeEntryInput {
    const title = input.title.trim()
    const content = input.content.trim()
    if (title === '') throw new Error('条目标题不能为空')
    if (content === '') throw new Error('条目正文不能为空')
    if (title.length > MAX_TITLE) throw new Error(`条目标题不能超过 ${MAX_TITLE} 字`)
    if (content.length > MAX_CONTENT) throw new Error(`条目正文不能超过 ${MAX_CONTENT} 字`)
    return { title, content, enabled: input.enabled }
  }
}
