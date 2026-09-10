import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ClaimedMessageTask, MessageChunkView, MessageTaskDetail, MessageTaskInput, MessageTaskView } from './types.js'

const LEASE_MS = 60_000
const MAX_ATTEMPTS = 3
const hash = (value: string): string => createHash('sha256').update(value).digest('hex')
const now = (): string => new Date().toISOString()

/** 管理 POPO 消息任务与固定分段的持久状态。 */
export class MessageRepository {
  constructor(private readonly db: Database.Database) {}

  /** 原子创建消息任务及全部固定分段，重复幂等键返回既有任务。 */
  create(input: MessageTaskInput): MessageTaskDetail {
    const existing = this.getByDeliveryKey(input.deliveryKey)
    if (existing) return existing
    const id = randomUUID()
    const createdAt = now()
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO message_tasks
        (id,delivery_key,source_type,source_id,actor,message,message_hash,status,chunk_count,
         sent_chunk_count,attempts,max_attempts,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,'pending',?,0,0,?,?,?)`).run(
        id, input.deliveryKey, input.sourceType, input.sourceId ?? null, input.actor,
        input.message, input.messageHash, input.chunks.length, MAX_ATTEMPTS, createdAt, createdAt,
      )
      const insert = this.db.prepare(`INSERT INTO message_chunks
        (task_id,sequence,content,content_hash,byte_length,character_length,status,attempts,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'pending',0,?,?)`)
      input.chunks.forEach((content, sequence) => insert.run(
        id, sequence, content, hash(content), Buffer.byteLength(content, 'utf8'), [...content].length,
        createdAt, createdAt,
      ))
    })()
    return this.get(id) as MessageTaskDetail
  }

  /** 读取最近消息任务摘要。 */
  list(limit = 30, status?: string): MessageTaskView[] {
    const where = status ? 'WHERE status=?' : ''
    const params = status ? [status, limit] : [limit]
    return this.db.prepare(`SELECT id,source_type sourceType,source_id sourceId,actor,status,
      chunk_count chunkCount,sent_chunk_count sentChunkCount,attempts,error,created_at createdAt,
      updated_at updatedAt,completed_at completedAt FROM message_tasks ${where}
      ORDER BY created_at DESC LIMIT ?`).all(...params) as MessageTaskView[]
  }

  /** 按标识读取消息正文和分段详情。 */
  get(id: string): MessageTaskDetail | undefined {
    const task = this.db.prepare(`SELECT id,delivery_key deliveryKey,source_type sourceType,
      source_id sourceId,actor,message,message_hash messageHash,status,chunk_count chunkCount,
      sent_chunk_count sentChunkCount,attempts,error,created_at createdAt,updated_at updatedAt,
      completed_at completedAt FROM message_tasks WHERE id=?`).get(id) as MessageTaskDetail | undefined
    if (!task) return undefined
    const chunks = this.db.prepare(`SELECT sequence "index",sequence+1 position,content,
      content_hash contentHash,byte_length byteLength,character_length characterLength,status,
      attempts,error,msg_id msgId,sent_at sentAt,updated_at updatedAt FROM message_chunks
      WHERE task_id=? ORDER BY sequence`).all(id) as MessageChunkView[]
    return { ...task, chunks, canResume: ['failed', 'partial'].includes(task.status), canRecall: false }
  }

  /** 按幂等键读取消息。 */
  getByDeliveryKey(key: string): MessageTaskDetail | undefined {
    const row = this.db.prepare('SELECT id FROM message_tasks WHERE delivery_key=?').get(key) as { id: string } | undefined
    return row ? this.get(row.id) : undefined
  }

  /** 原子领取可发送任务；已完成或有效租约任务不可重复领取。 */
  claim(id: string, leaseMs = LEASE_MS): ClaimedMessageTask | undefined {
    const owner = randomUUID()
    const current = now()
    const expiresAt = new Date(Date.now() + leaseMs).toISOString()
    const changed = this.db.prepare(`UPDATE message_tasks SET status='sending',attempts=attempts+1,
      lease_owner=?,lease_expires_at=?,updated_at=? WHERE id=? AND status!='sent' AND status!='dead-letter'
      AND (status!='sending' OR lease_expires_at IS NULL OR lease_expires_at<=?)`)
      .run(owner, expiresAt, current, id, current).changes
    if (!changed) return undefined
    const task = this.get(id)
    return task ? { ...task, leaseOwner: owner } : undefined
  }

  /** 将分段置为发送中并续租。 */
  startChunk(taskId: string, sequence: number, owner: string): boolean {
    const updatedAt = now()
    return this.db.transaction(() => {
      const task = this.db.prepare(`UPDATE message_tasks SET lease_expires_at=?,updated_at=?
        WHERE id=? AND lease_owner=? AND status='sending'`)
        .run(new Date(Date.now() + LEASE_MS).toISOString(), updatedAt, taskId, owner)
      if (task.changes !== 1) return false
      return this.db.prepare(`UPDATE message_chunks SET status='sending',attempts=attempts+1,
        error=NULL,updated_at=? WHERE task_id=? AND sequence=? AND status!='sent'`)
        .run(updatedAt, taskId, sequence).changes === 1
    })()
  }

  /** 保存成功分段的远端消息标识并更新汇总进度。 */
  completeChunk(taskId: string, sequence: number, owner: string, msgId: string): boolean {
    const updatedAt = now()
    return this.db.transaction(() => {
      const chunk = this.db.prepare(`UPDATE message_chunks SET status='sent',error=NULL,msg_id=?,
        sent_at=?,updated_at=? WHERE task_id=? AND sequence=? AND status='sending'`)
        .run(msgId, updatedAt, updatedAt, taskId, sequence)
      if (chunk.changes !== 1) return false
      const count = (this.db.prepare("SELECT COUNT(*) count FROM message_chunks WHERE task_id=? AND status='sent'")
        .get(taskId) as { count: number }).count
      return this.db.prepare(`UPDATE message_tasks SET sent_chunk_count=?,updated_at=?
        WHERE id=? AND lease_owner=?`).run(count, updatedAt, taskId, owner).changes === 1
    })()
  }

  /** 完成全部分段并释放租约。 */
  completeTask(id: string, owner: string): boolean {
    const completedAt = now()
    return this.db.prepare(`UPDATE message_tasks SET status='sent',error=NULL,completed_at=?,
      lease_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND lease_owner=?
      AND sent_chunk_count=chunk_count`).run(completedAt, completedAt, id, owner).changes === 1
  }

  /** 保存失败分段和任务状态，达到上限后进入死信。 */
  failChunk(task: ClaimedMessageTask, sequence: number, error: string, uncertain = false): void {
    const updatedAt = now()
    const status = task.attempts >= MAX_ATTEMPTS ? 'dead-letter' : task.sentChunkCount > 0 ? 'partial' : 'failed'
    this.db.transaction(() => {
      this.db.prepare(`UPDATE message_chunks SET status=?,error=?,updated_at=?
        WHERE task_id=? AND sequence=? AND status='sending'`)
        .run(uncertain ? 'uncertain' : 'failed', error.slice(0, 500), updatedAt, task.id, sequence)
      this.db.prepare(`UPDATE message_tasks SET status=?,error=?,lease_owner=NULL,lease_expires_at=NULL,
        dead_lettered_at=?,updated_at=? WHERE id=? AND lease_owner=?`).run(
        status, error.slice(0, 500), status === 'dead-letter' ? updatedAt : null, updatedAt, task.id, task.leaseOwner,
      )
    })()
  }
}
