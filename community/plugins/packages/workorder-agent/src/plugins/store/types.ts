export type DeliveryStatus = 'pending' | 'sent' | 'failed'
export type WebhookStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead-letter'

export interface RunRecord {
  id: string
  type: string
  startDate: string
  endDate: string
  status: string
  scanned: number
  violationCount: number
  createdAt: string
}

export interface PreviewRecord {
  id: string
  type: string
  startDate: string
  endDate: string
  message: string
  messageHash: string
  resultJson: string
  expiresAt: string
  status: 'pending' | 'sent'
}

export interface WebhookTask {
  traceId: string
  issueId: number
  projectId: number
  payloadJson: string
  status: WebhookStatus
  attempts: number
  leaseOwner?: string
}

export interface WebhookEventView {
  traceId: string
  issueId: number
  projectId: number
  status: WebhookStatus
  attempts: number
  error?: string
  createdAt: string
  updatedAt: string
}

export interface PreviewView {
  id: string
  startDate: string
  endDate: string
  status: 'pending' | 'sent'
  expiresAt: string
  createdAt: string
}

export interface PreviewDetail extends PreviewView {
  type: string
  message: string
  scanned: number
  violationCount: number
}

export interface SettingRecord {
  key: string
  value: string
  updatedAt?: string
  updatedBy?: string
}

export interface AuditEvent {
  id?: number
  category: string
  action: string
  subject: string
  detail: unknown
  actor: string
  createdAt?: string
}

export interface StoreHealth {
  ready: boolean
  migrations: boolean
  writable: boolean
}

export type ReviewModelStatus = 'completed' | 'failed' | 'skipped'
export type ReviewNotificationStatus = 'not-required' | 'disabled' | 'blocked' | 'sent' | 'in-progress' | 'failed'

export interface IssueReviewRecord {
  id: string
  traceId?: string
  issueId: number
  projectName: string
  submitterName: string
  triggerType: 'webhook' | 'manual'
  violations: Array<{ ruleId: string; message: string }>
  modelStatus: ReviewModelStatus
  modelOutput: string
  notificationStatus: ReviewNotificationStatus
  notificationTaskId?: string
  notificationError?: string
  createdAt?: string
}

export interface IssueReviewView extends IssueReviewRecord {
  createdAt: string
}
