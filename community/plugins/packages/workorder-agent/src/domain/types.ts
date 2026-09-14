export type ProjectName = '渠道美术' | '回流业务' | 'AI运营活动'

/** 巡检规则与本地入库共用的工单字段快照。 */

export interface IssueSnapshot {
  id: number
  projectName: string
  subject: string
  submitterName: string
  /** 提单人邮箱；仅用于展示与留痕。 */
  submitterEmail: string
  assigneeName: string
  /** 指派给邮箱；缺项提醒的单聊接收人（设计师本人）。 */
  assigneeEmail: string
  statusName: string
  gameProduct: string
  expectedDeliveryDate: string
  artCategory: string
  deliveryChannel: unknown
  returnDeliveryChannel: unknown
  aiDeliveryChannel: unknown
  aiPipelineTime: unknown
  totalHours: unknown
  designQuantity: unknown
  startDate: string
  dueDate: string
  createdOn: string
  updatedOn: string
  closedOn: string
}

export interface Violation {
  issueId: number
  projectName: string
  assigneeName: string
  subject: string
  ruleId: string
  message: string
  fieldValueHash: string
}

export type InspectionType = 'daily' | 'weekly' | 'acceptance'

export interface InspectionRequest {
  type: InspectionType
  startDate: string
  endDate: string
  send: boolean
  automatic?: boolean
}

export interface InspectionResult {
  runId: string
  previewId?: string
  type: InspectionType
  startDate: string
  endDate: string
  scanned: number
  violations: Violation[]
  message: string | null
  sent: boolean
}
