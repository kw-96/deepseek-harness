import type Database from 'better-sqlite3'
import type { IssueReviewRecord, IssueReviewView, ReviewModelStatus, ReviewNotificationStatus } from '../types.js'

interface ReviewRow {
  id: string
  traceId?: string
  issueId: number
  projectName: string
  submitterName: string
  triggerType: 'webhook' | 'manual'
  violationsJson: string
  modelStatus: ReviewModelStatus
  modelOutput: string
  notificationStatus: ReviewNotificationStatus
  notificationTaskId?: string
  notificationError?: string
  createdAt: string
}

function parseViolations(value: string): IssueReviewView['violations'] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.flatMap((item) => item && typeof item === 'object'
        && typeof (item as { ruleId?: unknown }).ruleId === 'string'
        && typeof (item as { message?: unknown }).message === 'string'
        ? [{ ruleId: (item as { ruleId: string }).ruleId, message: (item as { message: string }).message }]
        : [])
      : []
  } catch {
    return []
  }
}

function toView(row: ReviewRow): IssueReviewView {
  return { ...row, violations: parseViolations(row.violationsJson) }
}

/** 持久化单张工单的规则、模型与 POPO 审核结果。 */
export class ReviewRepository {
  constructor(private readonly db: Database.Database) {}

  /** 写入不可变的单次审核记录。 */
  save(record: IssueReviewRecord): void {
    this.db.prepare(`INSERT INTO issue_reviews(
      id,trace_id,issue_id,project_name,submitter_name,trigger_type,violations_json,
      model_status,model_output,notification_status,notification_task_id,notification_error,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      record.id, record.traceId ?? null, record.issueId, record.projectName, record.submitterName,
      record.triggerType, JSON.stringify(record.violations), record.modelStatus, record.modelOutput,
      record.notificationStatus, record.notificationTaskId ?? null, record.notificationError ?? null,
      record.createdAt ?? new Date().toISOString(),
    )
  }

  /** 按创建时间倒序返回审核列表。 */
  list(limit = 100): IssueReviewView[] {
    const size = Math.min(Math.max(Math.trunc(limit), 1), 500)
    const rows = this.db.prepare(`SELECT id,trace_id traceId,issue_id issueId,project_name projectName,
      submitter_name submitterName,trigger_type triggerType,violations_json violationsJson,
      model_status modelStatus,model_output modelOutput,notification_status notificationStatus,
      notification_task_id notificationTaskId,notification_error notificationError,created_at createdAt
      FROM issue_reviews ORDER BY created_at DESC LIMIT ?`).all(size) as ReviewRow[]
    return rows.map(toView)
  }

  /** 返回指定审核记录，不存在时返回 undefined。 */
  get(id: string): IssueReviewView | undefined {
    const row = this.db.prepare(`SELECT id,trace_id traceId,issue_id issueId,project_name projectName,
      submitter_name submitterName,trigger_type triggerType,violations_json violationsJson,
      model_status modelStatus,model_output modelOutput,notification_status notificationStatus,
      notification_task_id notificationTaskId,notification_error notificationError,created_at createdAt
      FROM issue_reviews WHERE id=?`).get(id) as ReviewRow | undefined
    return row ? toView(row) : undefined
  }
}
