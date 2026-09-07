import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { WebhookTask } from './types.js'

const LEASE_MS = 60_000
const MAX_WEBHOOK_ATTEMPTS = 3

/** 原子领取发送租约，过期的 pending 记录可恢复。 */
export function beginDelivery(db: Database.Database, key: string, leaseMs = LEASE_MS): string | undefined {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + leaseMs).toISOString()
  return db.transaction(() => {
    const row = db.prepare('SELECT status, lease_expires_at expiresAt FROM deliveries WHERE key=?')
      .get(key) as { status: string; expiresAt?: string } | undefined
    if (row?.status === 'sent') return undefined
    if (row?.status === 'pending' && row.expiresAt && row.expiresAt > now.toISOString()) return undefined
    const owner = randomUUID()
    db.prepare(`INSERT INTO deliveries(key,status,attempts,error,updated_at,lease_expires_at,lease_owner)
      VALUES(?,'pending',1,NULL,?,?,?) ON CONFLICT(key) DO UPDATE SET status='pending',
      attempts=attempts+1,error=NULL,updated_at=excluded.updated_at,
      lease_expires_at=excluded.lease_expires_at,lease_owner=excluded.lease_owner`)
      .run(key, now.toISOString(), expiresAt, owner)
    return owner
  })()
}

/** 原子领取 Webhook 任务，并恢复已过期的 processing 租约。 */
export function claimWebhook(db: Database.Database, leaseMs = LEASE_MS): WebhookTask | undefined {
  return db.transaction(() => {
    const now = new Date()
    const nowText = now.toISOString()
    db.prepare(`UPDATE webhook_events SET status='dead-letter',dead_lettered_at=?,updated_at=?,
      lease_expires_at=NULL,lease_owner=NULL WHERE status IN ('pending','failed','processing')
      AND attempts>=? AND (status!='processing' OR lease_expires_at IS NULL OR lease_expires_at<=?)`)
      .run(nowText, nowText, MAX_WEBHOOK_ATTEMPTS, nowText)
    const row = db.prepare(`SELECT trace_id traceId,issue_id issueId,project_id projectId,
      payload_json payloadJson,status,attempts FROM webhook_events WHERE attempts<? AND
      ((status IN ('pending','failed') AND (next_attempt_at IS NULL OR next_attempt_at<=?)) OR
      (status='processing' AND (lease_expires_at IS NULL OR lease_expires_at<=?)))
      ORDER BY created_at LIMIT 1`).get(MAX_WEBHOOK_ATTEMPTS, nowText, nowText) as WebhookTask | undefined
    if (!row) return undefined
    const owner = randomUUID()
    const result = db.prepare(`UPDATE webhook_events SET status='processing',attempts=attempts+1,
      lease_owner=?,lease_expires_at=?,updated_at=? WHERE trace_id=? AND attempts=?`)
      .run(owner, new Date(now.getTime() + leaseMs).toISOString(), nowText, row.traceId, row.attempts)
    return result.changes === 1
      ? { ...row, status: 'processing' as const, attempts: row.attempts + 1, leaseOwner: owner }
      : undefined
  })()
}

/** 记录失败；达到上限后转入 dead-letter。 */
export function failWebhook(db: Database.Database, task: WebhookTask, error: string): void {
  const terminal = task.attempts >= MAX_WEBHOOK_ATTEMPTS
  const now = new Date()
  const next = terminal ? null : new Date(now.getTime() + 2 ** task.attempts * 1000).toISOString()
  db.prepare(`UPDATE webhook_events SET status=?,error=?,next_attempt_at=?,dead_lettered_at=?,
    lease_expires_at=NULL,lease_owner=NULL,updated_at=? WHERE trace_id=? AND lease_owner=?`)
    .run(terminal ? 'dead-letter' : 'failed', error.slice(0, 500), next,
      terminal ? now.toISOString() : null, now.toISOString(), task.traceId, task.leaseOwner)
}
