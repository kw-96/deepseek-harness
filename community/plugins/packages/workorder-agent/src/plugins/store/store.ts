import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { IssueRepository } from './issues/repository.js'
import { MessageRepository } from './message/repository.js'
import { ReviewRepository } from './reviews/repository.js'
import { beginDelivery, claimWebhook, failWebhook } from './runtime/leases.js'
import { StoreSettings } from './runtime/settings.js'
import { LATEST_SCHEMA_VERSION } from './schema/migrations.js'
import { initializeSchema } from './schema/index.js'
import type { AuditEvent, IssueReviewRecord, IssueReviewView, PreviewDetail, PreviewRecord, PreviewView, RunRecord, SettingRecord, StoreHealth, WebhookEventView, WebhookTask } from './types.js'

export type { AuditEvent, IssueReviewRecord, IssueReviewView, PreviewDetail, PreviewRecord, PreviewView, RunRecord, SettingRecord, StoreHealth, WebhookEventView, WebhookTask } from './types.js'

/** 巡检、租约、设置与审计的 SQLite 存储。 */
export class WorkorderStore {
  private readonly db: Database.Database
  readonly messages: MessageRepository
  readonly issues: IssueRepository
  readonly reviews: ReviewRepository
  private readonly settings: StoreSettings

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('busy_timeout = 500')
    this.db.pragma('foreign_keys = ON')
    initializeSchema(this.db)
    this.messages = new MessageRepository(this.db)
    this.issues = new IssueRepository(this.db)
    this.reviews = new ReviewRepository(this.db)
    this.settings = new StoreSettings(this.db)
  }

  /** 写入巡检批次。 */
  saveRun(run: RunRecord): void {
    this.db.prepare(`INSERT OR REPLACE INTO runs (id,type,start_date,end_date,status,scanned,violation_count,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(run.id, run.type, run.startDate, run.endDate, run.status, run.scanned, run.violationCount, run.createdAt)
  }

  /** 返回最近巡检批次。 */
  listRuns(limit = 30): RunRecord[] {
    return this.db.prepare(`SELECT id,type,start_date startDate,end_date endDate,status,scanned,violation_count violationCount,created_at createdAt FROM runs ORDER BY created_at DESC LIMIT ?`).all(limit) as RunRecord[]
  }

  /** 获取发送租约；过期 pending 记录允许恢复。 */
  beginDelivery(key: string, leaseMs?: number): string | undefined { return beginDelivery(this.db, key, leaseMs) }

  /** 标记发送成功，仅当前租约所有者可以提交。 */
  markDeliverySent(key: string, owner: string): boolean {
    return this.db.prepare(`UPDATE deliveries SET status='sent',error=NULL,lease_expires_at=NULL,lease_owner=NULL,updated_at=? WHERE key=? AND lease_owner=?`).run(new Date().toISOString(), key, owner).changes === 1
  }

  /** 标记发送失败，仅当前租约所有者可以提交。 */
  markDeliveryFailed(key: string, owner: string, error: string): boolean {
    return this.db.prepare(`UPDATE deliveries SET status='failed',error=?,lease_expires_at=NULL,lease_owner=NULL,updated_at=? WHERE key=? AND lease_owner=?`).run(error.slice(0, 500), new Date().toISOString(), key, owner).changes === 1
  }

  /** 保存不可变正式预览。 */
  savePreview(preview: PreviewRecord): void {
    this.db.prepare(`INSERT INTO previews (id,type,start_date,end_date,message,message_hash,result_json,expires_at,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(preview.id, preview.type, preview.startDate, preview.endDate, preview.message, preview.messageHash, preview.resultJson, preview.expiresAt, preview.status, new Date().toISOString())
  }

  /** 返回最近正式预览的脱敏视图。 */
  listPreviews(limit = 30): PreviewView[] {
    return this.db.prepare(`SELECT id,start_date startDate,end_date endDate,status,expires_at expiresAt,created_at createdAt FROM previews ORDER BY created_at DESC LIMIT ?`).all(limit) as PreviewView[]
  }

  /** 返回指定正式预览的安全详情，不暴露哈希和内部结果 JSON。 */
  getPreviewDetail(id: string): PreviewDetail | undefined {
    const row = this.db.prepare(`SELECT id,type,start_date startDate,end_date endDate,message,status,expires_at expiresAt,created_at createdAt,result_json resultJson FROM previews WHERE id=?`).get(id) as (PreviewDetail & { resultJson: string }) | undefined
    if (!row) return undefined
    let result: { snapshots?: number; violations?: unknown[] } = {}
    try { result = JSON.parse(row.resultJson) as typeof result } catch { result = {} }
    const preview = { ...row }
    delete (preview as Partial<typeof row>).resultJson
    return { ...preview, scanned: Number(result.snapshots ?? 0), violationCount: Array.isArray(result.violations) ? result.violations.length : 0 }
  }

  /** 读取任意状态的正式预览，用于人工确认后的再次发送。 */
  getPreview(id: string): PreviewRecord | undefined {
    return this.db.prepare(`SELECT id,type,start_date startDate,end_date endDate,message,message_hash messageHash,result_json resultJson,expires_at expiresAt,status FROM previews WHERE id=?`).get(id) as PreviewRecord | undefined
  }

  /** 读取尚未发送且未过期的正式预览。 */
  getActivePreview(id: string): PreviewRecord | undefined {
    return this.db.prepare(`SELECT id,type,start_date startDate,end_date endDate,message,message_hash messageHash,result_json resultJson,expires_at expiresAt,status FROM previews WHERE id=? AND status='pending' AND expires_at>?`).get(id, new Date().toISOString()) as PreviewRecord | undefined
  }

  /** 原子标记预览已发送。 */
  markPreviewSent(id: string): boolean { return this.db.prepare("UPDATE previews SET status='sent' WHERE id=? AND status='pending'").run(id).changes === 1 }

  /** 返回最近 Webhook 事件的脱敏视图。 */
  listWebhooks(limit = 50): WebhookEventView[] {
    return this.db.prepare(`SELECT trace_id traceId,issue_id issueId,project_id projectId,status,attempts,error,created_at createdAt,updated_at updatedAt FROM webhook_events ORDER BY created_at DESC LIMIT ?`).all(limit) as WebhookEventView[]
  }

  /** 保存 Webhook 后台任务；重复 trace_id 返回 false。 */
  saveWebhook(task: Omit<WebhookTask, 'status' | 'attempts'>): boolean {
    const now = new Date().toISOString()
    return this.db.prepare(`INSERT OR IGNORE INTO webhook_events (trace_id,issue_id,project_id,payload_json,status,attempts,created_at,updated_at) VALUES(?,?,?,?,'pending',0,?,?)`).run(task.traceId, task.issueId, task.projectId, task.payloadJson, now, now).changes === 1
  }

  /** 领取一个到期或租约过期的 Webhook 任务。 */
  claimWebhook(leaseMs?: number): WebhookTask | undefined { return claimWebhook(this.db, leaseMs) }

  /** 完成 Webhook 审核，并校验租约所有者。 */
  completeWebhook(task: WebhookTask, result: unknown): void {
    this.db.prepare(`UPDATE webhook_events SET status='completed',result_json=?,error=NULL,lease_expires_at=NULL,lease_owner=NULL,updated_at=? WHERE trace_id=? AND lease_owner=?`).run(JSON.stringify(result), new Date().toISOString(), task.traceId, task.leaseOwner)
  }

  /** 记录 Webhook 失败，达到上限后写入死信状态。 */
  failWebhook(task: WebhookTask, error: string): void { failWebhook(this.db, task, error) }

  /** 写入类型化设置，并保留修改主体。 */
  setSetting(setting: SettingRecord): void { this.settings.set(setting) }

  /** 读取设置；兼容旧 settings 表记录。 */
  getSetting(key: string): SettingRecord | undefined { return this.settings.get(key) }

  /** 保存布尔开关。 */
  setFlag(key: string, enabled: boolean, actor = 'system'): void { this.settings.setFlag(key, enabled, actor) }

  /** 读取布尔开关，缺失或非法值均使用默认值。 */
  getFlag(key: string, fallback = false): boolean { return this.settings.getFlag(key, fallback) }

  /** 追加不可变审计事件。 */
  appendAudit(event: AuditEvent): void { this.settings.appendAudit(event) }

  /** 检查迁移状态和数据库写能力。 */
  health(): StoreHealth {
    try {
      const migrations = (this.db.prepare('SELECT MAX(version) version FROM schema_migrations').get() as { version?: number }).version === LATEST_SCHEMA_VERSION
      this.db.exec('BEGIN IMMEDIATE; ROLLBACK;')
      return { ready: migrations, migrations, writable: true }
    } catch { return { ready: false, migrations: false, writable: false } }
  }

  /** 关闭数据库连接。 */
  close(): void { this.db.close() }
}
