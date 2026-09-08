import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import type { PreviewRecord } from '../../src/plugins/store/store.js'
import { WorkorderStore } from '../../src/plugins/store/store.js'

const directories: string[] = []

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'workorder-store-'))
  directories.push(directory)
  return join(directory, 'store.sqlite')
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('存储迁移与租约恢复', () => {
  it('迁移旧表并保留原设置', () => {
    const path = databasePath()
    const legacy = new Database(path)
    legacy.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO settings VALUES ('auto_schedule_enabled', 'true');
    `)
    legacy.close()
    const store = new WorkorderStore(path)
    expect(store.getFlag('auto_schedule_enabled')).toBe(true)
    expect(store.health()).toEqual({ ready: true, migrations: true, writable: true })
    store.setFlag('schedule_enabled', true, 'test')
    expect(store.getSetting('schedule_enabled')).toMatchObject({ value: 'true', updatedBy: 'test' })
    store.close()
  })

  it('从预览结果读取复核详情统计', () => {
    const store = new WorkorderStore(databasePath())
    const preview: PreviewRecord = {
      id: 'preview-id', type: 'acceptance', startDate: '2026-08-14', endDate: '2026-08-14',
      message: '待发送内容', messageHash: 'hash',
      resultJson: JSON.stringify({ snapshots: 26, violations: [{ ruleId: 'required-fields' }] }),
      expiresAt: '2026-08-15T00:00:00.000Z', status: 'pending',
    }
    store.savePreview(preview)
    expect(store.getPreviewDetail(preview.id)).toMatchObject({
      message: '待发送内容', scanned: 26, violationCount: 1,
    })
    expect(store.getPreview(preview.id)).toMatchObject({ message: '待发送内容', messageHash: 'hash' })
    store.close()
  })

  it('恢复过期 delivery pending 租约', () => {
    const store = new WorkorderStore(databasePath())
    const expiredOwner = store.beginDelivery('delivery', -1)
    const currentOwner = store.beginDelivery('delivery')
    expect(expiredOwner).toBeTruthy()
    expect(currentOwner).toBeTruthy()
    expect(store.beginDelivery('delivery')).toBeUndefined()
    expect(store.markDeliverySent('delivery', expiredOwner ?? '')).toBe(false)
    expect(store.markDeliverySent('delivery', currentOwner ?? '')).toBe(true)
    expect(store.beginDelivery('delivery')).toBeUndefined()
    store.close()
  })

  it('原子创建消息任务并保存分段消息标识', () => {
    const store = new WorkorderStore(databasePath())
    const message = '完整消息'
    const task = store.messages.create({
      deliveryKey: 'message-key', sourceType: 'test', actor: 'tester', message,
      messageHash: createHash('sha256').update(message).digest('hex'), chunks: ['第一段', '第二段'],
    })
    expect(store.messages.create({
      deliveryKey: 'message-key', sourceType: 'test', actor: 'tester', message,
      messageHash: task.messageHash, chunks: ['不应覆盖'],
    }).id).toBe(task.id)
    const claimed = store.messages.claim(task.id)
    expect(claimed).toBeTruthy()
    if (!claimed) throw new Error('消息任务领取失败')
    expect(store.messages.startChunk(task.id, 0, claimed.leaseOwner)).toBe(true)
    expect(store.messages.completeChunk(task.id, 0, claimed.leaseOwner, 'msg-1')).toBe(true)
    expect(store.messages.get(task.id)?.chunks[0]).toMatchObject({ status: 'sent', msgId: 'msg-1' })
    store.close()
  })

  it('恢复 processing Webhook 并在第三次失败后死信', () => {
    const store = new WorkorderStore(databasePath())
    store.saveWebhook({ traceId: 'trace', issueId: 1, projectId: 7, payloadJson: '{}' })
    const first = store.claimWebhook(-1)
    const second = store.claimWebhook(-1)
    const third = store.claimWebhook()
    expect([first?.attempts, second?.attempts, third?.attempts]).toEqual([1, 2, 3])
    if (!third) throw new Error('未领取第三次任务')
    store.failWebhook(third, '持续失败')
    expect(store.claimWebhook()).toBeUndefined()
    store.close()
  })

  it('按工单 ID 覆盖写入快照并读回字段', () => {
    const store = new WorkorderStore(databasePath())
    const issue = {
      id: 81001, projectName: '渠道美术', subject: '主题', assigneeName: '用户', statusName: '美术完成',
      gameProduct: '游戏', expectedDeliveryDate: '2026-08-14', artCategory: '子单',
      deliveryChannel: '渠道', returnDeliveryChannel: '', aiDeliveryChannel: '',
      aiPipelineTime: '是', totalHours: 2.5, designQuantity: 3,
      startDate: '2026-08-01', dueDate: '2026-08-10', createdOn: '2026-08-01T00:00:00.000Z',
      updatedOn: '2026-08-10T00:00:00.000Z', closedOn: '2026-08-10T12:00:00.000Z',
    }
    store.issues.upsert(issue)
    expect(store.issues.get(81001)).toMatchObject({ subject: '主题', totalHours: '2.5', updatedOn: issue.updatedOn })
    store.issues.upsert({ ...issue, subject: '新主题', updatedOn: '2026-08-11T00:00:00.000Z' })
    expect(store.issues.get(81001)).toMatchObject({ subject: '新主题', updatedOn: '2026-08-11T00:00:00.000Z' })
    store.issues.upsert({ ...issue, id: 81002, updatedOn: '2026-08-12T00:00:00.000Z' })
    expect(store.issues.count()).toBe(2)
    expect(store.issues.list(1).map((item) => item.id)).toEqual([81002])
    store.close()
  })
})
