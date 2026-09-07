import { createHash } from 'node:crypto'
import type { WorkorderStore } from '../store/store.js'
import type { MessageTaskDetail, MessageTaskResult } from '../store/message/types.js'
import { splitPopoMessage } from './messageChunks.js'
import type { PopoClient } from './client.js'

export interface DeliveryInput {
  key: string
  message: string
  sourceType: string
  sourceId?: string
  actor: string
  automatic?: boolean
}

const hash = (value: string): string => createHash('sha256').update(value).digest('hex')

/** 可靠 POPO 投递服务，负责持久化分段、顺序发送和失败续发。 */
export class PopoDeliveryService {
  constructor(private readonly store: WorkorderStore, private readonly client: PopoClient) {}

  /** 创建或复用消息任务并同步推进发送。 */
  async deliver(input: DeliveryInput): Promise<MessageTaskResult> {
    if (input.automatic && !this.store.getFlag('automatic_send_enabled')) {
      this.audit('blocked', input.key, { automatic: true }, input.actor)
      return { status: 'blocked' }
    }
    const oldOwner = this.store.beginDelivery(input.key)
    if (!oldOwner) {
      const existing = this.store.messages.getByDeliveryKey(input.key)
      return existing?.status === 'sent'
        ? { status: 'already-sent', taskId: existing.id }
        : { status: 'in-progress', taskId: existing?.id }
    }
    const task = this.store.messages.create({
      deliveryKey: input.key, sourceType: input.sourceType, sourceId: input.sourceId,
      actor: input.actor, message: input.message, messageHash: hash(input.message),
      chunks: splitPopoMessage(input.message),
    })
    try {
      const result = await this.process(task.id)
      if (!this.store.markDeliverySent(input.key, oldOwner)) throw new Error('发送租约已失效')
      this.audit('sent', task.id, { deliveryKey: input.key }, input.actor)
      return result
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.store.markDeliveryFailed(input.key, oldOwner, detail)
      this.audit('failed', task.id, { deliveryKey: input.key, error: detail }, input.actor)
      throw error
    }
  }

  /** 从首个未成功分段继续发送同一消息任务。 */
  async resume(taskId: string): Promise<MessageTaskResult> {
    const task = this.store.messages.get(taskId)
    if (!task) throw new Error('POPO 消息记录不存在')
    if (!task.canResume) throw new Error(task.status === 'sent' ? '该消息已经全部发送' : '该消息当前不可续发')
    this.validate(task)
    const result = await this.process(taskId)
    this.audit('resumed', taskId, {}, 'admin-ui')
    return result
  }

  private async process(taskId: string): Promise<MessageTaskResult> {
    const task = this.store.messages.claim(taskId)
    if (!task) return { status: 'in-progress', taskId }
    this.validate(task)
    for (const chunk of task.chunks.filter((item) => item.status !== 'sent')) {
      if (!this.store.messages.startChunk(task.id, chunk.index, task.leaseOwner)) {
        throw new Error('消息任务租约已失效')
      }
      try {
        const response = await this.client.sendText(chunk.content)
        if (!this.store.messages.completeChunk(task.id, chunk.index, task.leaseOwner, response.msgId)) {
          const uncertain = new Error('POPO 已接收消息，但本地状态保存失败，禁止自动重发')
          this.store.messages.failChunk(task, chunk.index, uncertain.message, true)
          throw uncertain
        }
        task.sentChunkCount += 1
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        this.store.messages.failChunk(task, chunk.index, detail)
        throw error
      }
    }
    if (!this.store.messages.completeTask(task.id, task.leaseOwner)) throw new Error('消息任务完成状态更新失败')
    return { status: 'sent', taskId: task.id }
  }

  private validate(task: MessageTaskDetail): void {
    if (hash(task.message) !== task.messageHash) throw new Error('POPO 消息完整性校验失败')
    for (const chunk of task.chunks) {
      if (hash(chunk.content) !== chunk.contentHash) throw new Error(`POPO 第 ${chunk.position} 段完整性校验失败`)
    }
  }

  private audit(action: string, subject: string, detail: unknown, actor: string): void {
    this.store.appendAudit({ category: 'popo-message', action, subject, detail, actor })
  }
}
