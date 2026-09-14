export type MessageTaskStatus = 'pending' | 'sending' | 'partial' | 'sent' | 'failed' | 'dead-letter'
export type MessageChunkStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain'

export interface MessageTaskInput {
  deliveryKey: string
  sourceType: string
  sourceId?: string
  actor: string
  message: string
  messageHash: string
  chunks: string[]
  /** 接收人（用户邮箱或群 ID）；空串表示使用发送器的默认接收人。 */
  receiver: string
}

export interface MessageTaskView {
  id: string
  sourceType: string
  sourceId?: string
  actor: string
  status: MessageTaskStatus
  chunkCount: number
  sentChunkCount: number
  attempts: number
  error?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface MessageChunkView {
  index: number
  position: number
  content: string
  contentHash: string
  byteLength: number
  characterLength: number
  status: MessageChunkStatus
  attempts: number
  error?: string
  msgId?: string
  sentAt?: string
  updatedAt: string
}

export interface MessageTaskDetail extends MessageTaskView {
  deliveryKey: string
  message: string
  messageHash: string
  chunks: MessageChunkView[]
  /** 任务级接收人；空串表示用发送器默认接收人。 */
  receiver: string
  canResume: boolean
  canRecall: false
}

export interface ClaimedMessageTask extends MessageTaskDetail {
  leaseOwner: string
}

export interface MessageTaskResult {
  status: 'sent' | 'already-sent' | 'in-progress' | 'blocked'
  taskId?: string
}
