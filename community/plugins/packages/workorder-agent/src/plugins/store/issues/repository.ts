import type Database from 'better-sqlite3'
import type { IssueSnapshot } from '../../../domain/types.js'

const COLUMNS = `id,project_name,subject,assignee_name,status_name,game_product,
  expected_delivery_date,art_category,delivery_channel,return_delivery_channel,
  ai_delivery_channel,ai_pipeline_time,total_hours,design_quantity,start_date,due_date,
  created_on,updated_on,closed_on,synced_at`

interface IssueRow {
  id: number
  project_name: string
  subject: string
  assignee_name: string
  status_name: string
  game_product: string
  expected_delivery_date: string
  art_category: string
  delivery_channel: string
  return_delivery_channel: string
  ai_delivery_channel: string
  ai_pipeline_time: string
  total_hours: string
  design_quantity: string
  start_date: string
  due_date: string
  created_on: string
  updated_on: string
  closed_on: string
  synced_at?: string
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function fromCell(value: string): unknown {
  if (value === '') return ''
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try { return JSON.parse(value) as unknown } catch { return value }
  }
  return value
}

function toSnapshot(row: IssueRow): IssueSnapshot {
  return {
    id: row.id,
    projectName: row.project_name,
    subject: row.subject,
    assigneeName: row.assignee_name,
    statusName: row.status_name,
    gameProduct: row.game_product,
    expectedDeliveryDate: row.expected_delivery_date,
    artCategory: row.art_category,
    deliveryChannel: fromCell(row.delivery_channel),
    returnDeliveryChannel: fromCell(row.return_delivery_channel),
    aiDeliveryChannel: fromCell(row.ai_delivery_channel),
    aiPipelineTime: fromCell(row.ai_pipeline_time),
    totalHours: fromCell(row.total_hours),
    designQuantity: fromCell(row.design_quantity),
    startDate: row.start_date,
    dueDate: row.due_date,
    createdOn: row.created_on,
    updatedOn: row.updated_on,
    closedOn: row.closed_on,
  }
}

/** 持久化工单快照，供巡检按更新时间复用。 */
export class IssueRepository {
  constructor(private readonly db: Database.Database) {}

  /** 按工单 ID 读取本地快照。 */
  get(id: number): IssueSnapshot | undefined {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM issues WHERE id=?`).get(id) as IssueRow | undefined
    return row ? toSnapshot(row) : undefined
  }

  /** 按更新时间倒序列出本地工单快照。 */
  list(limit = 200): IssueSnapshot[] {
    const size = Math.min(Math.max(Math.trunc(limit), 1), 500)
    const rows = this.db.prepare(
      `SELECT ${COLUMNS} FROM issues ORDER BY updated_on DESC, id DESC LIMIT ?`,
    ).all(size) as IssueRow[]
    return rows.map(toSnapshot)
  }

  /** 返回已入库工单总数。 */
  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS total FROM issues').get() as { total: number }).total
  }

  /** 覆盖写入工单快照。 */
  upsert(issue: IssueSnapshot): void {
    this.db.prepare(`INSERT INTO issues(
      id,project_name,subject,assignee_name,status_name,game_product,expected_delivery_date,
      art_category,delivery_channel,return_delivery_channel,ai_delivery_channel,ai_pipeline_time,
      total_hours,design_quantity,start_date,due_date,created_on,updated_on,closed_on,synced_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
      project_name=excluded.project_name,subject=excluded.subject,assignee_name=excluded.assignee_name,
      status_name=excluded.status_name,game_product=excluded.game_product,
      expected_delivery_date=excluded.expected_delivery_date,art_category=excluded.art_category,
      delivery_channel=excluded.delivery_channel,return_delivery_channel=excluded.return_delivery_channel,
      ai_delivery_channel=excluded.ai_delivery_channel,ai_pipeline_time=excluded.ai_pipeline_time,
      total_hours=excluded.total_hours,design_quantity=excluded.design_quantity,
      start_date=excluded.start_date,due_date=excluded.due_date,created_on=excluded.created_on,
      updated_on=excluded.updated_on,closed_on=excluded.closed_on,synced_at=excluded.synced_at`).run(
      issue.id, issue.projectName, issue.subject, issue.assigneeName, issue.statusName, issue.gameProduct,
      issue.expectedDeliveryDate, issue.artCategory, cell(issue.deliveryChannel),
      cell(issue.returnDeliveryChannel), cell(issue.aiDeliveryChannel), cell(issue.aiPipelineTime),
      cell(issue.totalHours), cell(issue.designQuantity), issue.startDate, issue.dueDate,
      issue.createdOn, issue.updatedOn, issue.closedOn, new Date().toISOString(),
    )
  }
}
