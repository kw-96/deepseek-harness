import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { KnowledgeEntry, KnowledgeEntryInput } from './types.js'

const COLUMNS = `id,title,content,enabled,position,created_at createdAt,updated_at updatedAt`

interface EntryRow {
  id: string
  title: string
  content: string
  enabled: number
  position: number
  createdAt: string
  updatedAt: string
}

function toEntry(row: EntryRow): KnowledgeEntry {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    enabled: row.enabled === 1,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** 提单规范条目的持久化仓库：按位置排序，支持启用开关与增删改。 */
export class KnowledgeRepository {
  constructor(private readonly db: Database.Database) {}

  /** 按位置升序列出全部条目。 */
  list(): KnowledgeEntry[] {
    const rows = this.db.prepare(`SELECT ${COLUMNS} FROM knowledge_entries ORDER BY position ASC, created_at ASC`)
      .all() as EntryRow[]
    return rows.map(toEntry)
  }

  /** 按标识读取条目。 */
  get(id: string): KnowledgeEntry | undefined {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM knowledge_entries WHERE id=?`).get(id) as EntryRow | undefined
    return row ? toEntry(row) : undefined
  }

  /** 返回条目总数。 */
  count(): number {
    return (this.db.prepare('SELECT COUNT(*) total FROM knowledge_entries').get() as { total: number }).total
  }

  /** 追加一条条目。 */
  create(input: KnowledgeEntryInput, position: number): KnowledgeEntry {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.prepare(`INSERT INTO knowledge_entries(id,title,content,enabled,position,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`).run(id, input.title, input.content, input.enabled ? 1 : 0, position, now, now)
    return { id, ...input, position, createdAt: now, updatedAt: now }
  }

  /** 覆盖更新一条条目；返回是否命中。 */
  update(id: string, input: KnowledgeEntryInput): boolean {
    return this.db.prepare(`UPDATE knowledge_entries SET title=?,content=?,enabled=?,updated_at=? WHERE id=?`)
      .run(input.title, input.content, input.enabled ? 1 : 0, new Date().toISOString(), id).changes === 1
  }

  /** 删除一条条目；返回是否命中。 */
  remove(id: string): boolean {
    return this.db.prepare('DELETE FROM knowledge_entries WHERE id=?').run(id).changes === 1
  }

  /**
   * 按给定顺序重排条目。
   * @param ids 目标顺序的条目标识
   */
  reorder(ids: string[]): void {
    const statement = this.db.prepare('UPDATE knowledge_entries SET position=?,updated_at=? WHERE id=?')
    const now = new Date().toISOString()
    const run = this.db.transaction(() => {
      ids.forEach((id, index) => { statement.run(index, now, id) })
    })
    run()
  }

  /** 用启用中的条目合成审核提示词使用的规范文本。 */
  composeEnabled(enabledOnly: boolean): string[] {
    const rows = this.db.prepare(`SELECT content FROM knowledge_entries
      ${enabledOnly ? 'WHERE enabled=1' : ''} ORDER BY position ASC, created_at ASC`).all() as Array<{ content: string }>
    return rows.map((row) => row.content.trim()).filter((item) => item !== '')
  }
}
