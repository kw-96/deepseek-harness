/** 一条提单规范条目。 */
export interface KnowledgeEntry {
  id: string
  title: string
  content: string
  enabled: boolean
  position: number
  createdAt: string
  updatedAt: string
}

/** 新增或更新条目时的输入。 */
export interface KnowledgeEntryInput {
  title: string
  content: string
  enabled: boolean
}
