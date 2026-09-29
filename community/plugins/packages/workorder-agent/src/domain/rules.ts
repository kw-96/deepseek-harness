import { createHash } from 'node:crypto'
import type { IssueSnapshot, ProjectName, Violation } from './types.js'

const CHANNEL_FIELDS: Record<ProjectName, keyof IssueSnapshot> = {
  渠道美术: 'deliveryChannel',
  回流业务: 'returnDeliveryChannel',
  AI运营活动: 'aiDeliveryChannel',
}

const CHANNEL_LABELS: Record<ProjectName, string> = {
  渠道美术: '投放渠道',
  回流业务: '回流投放渠道',
  AI运营活动: 'AI运营投放渠道',
}
const EARLIEST_DELIVERY_DATE = '2026-07-26'

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

function isPositive(value: unknown): boolean {
  if (isEmpty(value)) return false
  const number = Number(value)
  return Number.isFinite(number) && number > 0
}

function hashValues(issue: IssueSnapshot): string {
  return createHash('sha256').update(JSON.stringify(issue)).digest('hex').slice(0, 16)
}

function isInspectableDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && value >= EARLIEST_DELIVERY_DATE
}

/** 根据已确认的设计工单规则返回违规项。 */
export function inspectIssue(issue: IssueSnapshot): Violation[] {
  if (issue.statusName !== '美术完成' || !isInspectableDate(issue.expectedDeliveryDate)) return []
  const violations: Violation[] = []
  const add = (ruleId: string, message: string): void => {
    violations.push({
      issueId: issue.id,
      projectName: issue.projectName,
      assigneeName: issue.assigneeName || '未指派',
      subject: issue.subject,
      ruleId,
      message,
      fieldValueHash: hashValues(issue),
    })
  }
  if (issue.artCategory === '总单') {
    if (isPositive(issue.designQuantity)) {
      add('total-order-design-quantity', '请确认该工单是否为总单，总单不应填设计数量')
    }
    return violations
  }
  const missingFields: string[] = []
  if (issue.projectName in CHANNEL_FIELDS) {
    const project = issue.projectName as ProjectName
    if (isEmpty(issue[CHANNEL_FIELDS[project]])) missingFields.push(CHANNEL_LABELS[project])
  }
  if (!['是', '否'].includes(String(issue.aiPipelineTime ?? '').trim())) missingFields.push('AI管线耗时')
  if (!isPositive(issue.totalHours)) missingFields.push('总工时')
  if (!isPositive(issue.designQuantity)) missingFields.push('设计数量')
  if (missingFields.length > 0) add('required-fields', `未填写${missingFields.join('、')}`)
  return violations
}
