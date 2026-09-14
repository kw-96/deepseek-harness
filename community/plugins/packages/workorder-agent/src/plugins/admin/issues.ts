import { issueUrl } from '../../domain/message.js'
import type { IssueSnapshot } from '../../domain/types.js'

/** 将入库字段转为页面展示文本，不附加单位。 */
export function issueFieldText(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(issueFieldText).filter(Boolean).join('、')
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>
    const nested = item.name ?? item.value
    if (nested !== undefined && nested !== null && nested !== '') return issueFieldText(nested)
    return JSON.stringify(value)
  }
  return String(value)
}

export interface AdminIssueView {
  id: number
  url: string
  projectName: string
  subject: string
  submitterName: string
  /** 提单人邮箱（运营），仅用于展示与留痕。 */
  submitterEmail: string
  assigneeName: string
  /** 指派给邮箱（设计师）；缺项提醒的单聊接收人。 */
  assigneeEmail: string
  statusName: string
  gameProduct: string
  deliveryChannel: string
  returnDeliveryChannel: string
  aiDeliveryChannel: string
  artCategory: string
  aiPipelineTime: string
  totalHours: string
  designQuantity: string
  expectedDeliveryDate: string
  startDate: string
  dueDate: string
  createdOn: string
  updatedOn: string
  closedOn: string
}

/** 将工单快照转为控制面展示结构，并附带易协作详情地址。 */
export function toAdminIssue(issue: IssueSnapshot, host: string): AdminIssueView {
  return {
    id: issue.id,
    url: issueUrl(host, issue.id),
    projectName: issue.projectName,
    subject: issue.subject,
    submitterName: issue.submitterName,
    submitterEmail: issue.submitterEmail,
    assigneeName: issue.assigneeName,
    assigneeEmail: issue.assigneeEmail,
    statusName: issue.statusName,
    gameProduct: issue.gameProduct,
    deliveryChannel: issueFieldText(issue.deliveryChannel),
    returnDeliveryChannel: issueFieldText(issue.returnDeliveryChannel),
    aiDeliveryChannel: issueFieldText(issue.aiDeliveryChannel),
    artCategory: issue.artCategory,
    aiPipelineTime: issueFieldText(issue.aiPipelineTime),
    totalHours: issueFieldText(issue.totalHours),
    designQuantity: issueFieldText(issue.designQuantity),
    expectedDeliveryDate: issue.expectedDeliveryDate,
    startDate: issue.startDate,
    dueDate: issue.dueDate,
    createdOn: issue.createdOn,
    updatedOn: issue.updatedOn,
    closedOn: issue.closedOn,
  }
}
