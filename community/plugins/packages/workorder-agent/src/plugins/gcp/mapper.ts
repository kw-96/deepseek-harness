import { z } from 'zod'
import type { IssueSnapshot } from '../../domain/types.js'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}

function display(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim()
  }
  const item = record(value)
  return String(item.name ?? item.value ?? '').trim()
}

function hours(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return value
  if (typeof value === 'number' || typeof value === 'string') return value
  const item = record(value)
  return item.value !== undefined ? item.value : value
}

function fieldItems(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => Array.isArray(item) ? item : [item]).map(record)
}

function fieldValue(fields: UnknownRecord[], identify: string): unknown {
  const field = fields.find((item) => item.identify === identify || item.key === identify)
  return field?.value ?? field?.name
}

function coreValue(fields: UnknownRecord[], identify: string): unknown {
  return fieldValue(fields, identify) ?? fieldValue(fields, identify.replace(/_id$/, ''))
}

function snapshot(
  id: number,
  projectName: string,
  fields: Omit<IssueSnapshot, 'id' | 'projectName'>,
): IssueSnapshot {
  return { id, projectName, ...fields }
}

/** 将易协作详情响应归一化为规则快照。 */
export function mapIssueDetail(payload: unknown, fallbackProjectName: string): IssueSnapshot {
  const data = record(record(payload).data ?? payload)
  const base = record(data.base)
  const core = fieldItems(data.core_fields)
  const custom = fieldItems(data.cf_fields)
  const id = Number(base.id)
  if (!Number.isFinite(id)) throw new Error('易协作详情响应缺少有效工单 ID')
  return snapshot(id, display(base.project) || display(base.project_name) || fallbackProjectName.trim(), {
    subject: display(base.subject),
    submitterName: display(base.author ?? base.created_by ?? base.creator),
    assigneeName: display(base.assigned_to ?? coreValue(core, 'assigned_to')),
    statusName: display(base.status ?? coreValue(core, 'status_id')),
    gameProduct: display(fieldValue(custom, 'cf_127')),
    expectedDeliveryDate: display(fieldValue(custom, 'cf_7')),
    artCategory: display(fieldValue(custom, 'cf_129')),
    deliveryChannel: fieldValue(custom, 'cf_128'),
    returnDeliveryChannel: fieldValue(custom, 'cf_2000'),
    aiDeliveryChannel: fieldValue(custom, 'cf_2005'),
    aiPipelineTime: fieldValue(custom, 'cf_2002'),
    totalHours: coreValue(core, 'total_spent_hours'),
    designQuantity: fieldValue(custom, 'cf_134'),
    startDate: display(coreValue(core, 'start_date') ?? base.start_date),
    dueDate: display(coreValue(core, 'due_date') ?? base.due_date),
    createdOn: display(base.created_on),
    updatedOn: display(base.updated_on),
    closedOn: display(base.closed_on),
  })
}

/** 将 list_issues 行归一化为规则快照，避免再打详情。 */
export function mapListIssue(payload: unknown, fallbackProjectName: string): IssueSnapshot {
  const row = record(payload)
  const id = Number(row.id)
  if (!Number.isFinite(id)) throw new Error('易协作列表响应缺少有效工单 ID')
  return snapshot(id, display(row.project) || fallbackProjectName.trim(), {
    subject: display(row.subject),
    submitterName: display(row.author ?? row.created_by ?? row.creator),
    assigneeName: display(row.assigned_to),
    statusName: display(row.status),
    gameProduct: display(row.cf_127),
    expectedDeliveryDate: display(row.cf_7),
    artCategory: display(row.cf_129),
    deliveryChannel: row.cf_128,
    returnDeliveryChannel: row.cf_2000,
    aiDeliveryChannel: row.cf_2005,
    aiPipelineTime: row.cf_2002,
    totalHours: hours(row.spent_hours ?? row.total_spent_hours),
    designQuantity: row.cf_134,
    startDate: display(row.start_date),
    dueDate: display(row.due_date),
    createdOn: display(row.created_on),
    updatedOn: display(row.updated_on),
    closedOn: display(row.closed_on),
  })
}

const listSchema = z.object({
  total_count: z.coerce.number().int().nonnegative(),
  list: z.array(z.object({ id: z.coerce.number().int().positive() }).passthrough()),
}).passthrough()

export interface IssuePage {
  ids: number[]
  items: unknown[]
  totalCount: number
  itemCount: number
}

/** 严格解析列表响应及分页总数，结构异常时抛错。 */
export function parseIssuePage(payload: unknown): IssuePage {
  const parsed = listSchema.safeParse(record(record(payload).data ?? payload))
  if (!parsed.success) throw new Error(`易协作列表响应结构异常：${parsed.error.issues[0]?.message ?? '未知错误'}`)
  return {
    ids: parsed.data.list.map((item) => item.id),
    items: parsed.data.list,
    totalCount: parsed.data.total_count,
    itemCount: parsed.data.list.length,
  }
}
