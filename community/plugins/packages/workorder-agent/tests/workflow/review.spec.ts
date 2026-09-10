import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IssueSnapshot } from '../../src/domain/types.js'
import { WorkorderStore } from '../../src/plugins/store/store.js'
import { IssueReviewWorkflow } from '../../src/plugins/workflow/review.js'

const directories: string[] = []

function store(): WorkorderStore {
  const directory = mkdtempSync(join(tmpdir(), 'workorder-review-'))
  directories.push(directory)
  return new WorkorderStore(join(directory, 'review.sqlite'))
}

function issue(overrides: Partial<IssueSnapshot> = {}): IssueSnapshot {
  return {
    id: 9001, projectName: '渠道美术', subject: '测试工单', submitterName: '提单人', assigneeName: '设计师',
    statusName: '美术完成', gameProduct: '测试游戏', expectedDeliveryDate: '2026-09-09', artCategory: '子单',
    deliveryChannel: '', returnDeliveryChannel: '', aiDeliveryChannel: '', aiPipelineTime: '', totalHours: '', designQuantity: '',
    startDate: '', dueDate: '', createdOn: '', updatedOn: '2026-09-09T10:00:00.000Z', closedOn: '', ...overrides,
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('单工单填写核验', () => {
  it('持久化规则、模型与提单人 POPO 提醒回执', async () => {
    const database = store()
    const deliver = vi.fn(async () => ({ status: 'sent' as const, taskId: 'message-task' }))
    const reviewIssue = vi.fn(async () => '请补全缺失字段。')
    const workflow = new IssueReviewWorkflow(database, { deliver } as never, 'gcp.example.com', {
      enabled: true, maxTokens: 800, knowledgeBase: '提单规范', notificationEnabled: true,
    }, { reviewIssue })
    const reviewId = await workflow.reviewIssue({ traceId: 'trace-1', triggerType: 'webhook', issue: issue() })
    expect(reviewIssue).toHaveBeenCalledWith('trace-1', expect.objectContaining({ id: 9001 }))
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ automatic: true, sourceType: 'issue-review', message: expect.stringContaining('@提单人') }))
    expect(database.reviews.get(reviewId)).toMatchObject({
      issueId: 9001, triggerType: 'webhook', modelStatus: 'completed', modelOutput: '请补全缺失字段。',
      notificationStatus: 'sent', notificationTaskId: 'message-task',
    })
    database.close()
  })

  it('规则无缺项时保留模型结论但不创建 POPO 提醒', async () => {
    const database = store()
    const deliver = vi.fn()
    const workflow = new IssueReviewWorkflow(database, { deliver } as never, 'gcp.example.com', {
      enabled: false, maxTokens: 800, knowledgeBase: '提单规范', notificationEnabled: true,
    })
    const reviewId = await workflow.reviewIssue({ triggerType: 'manual', issue: issue({ deliveryChannel: '渠道', aiPipelineTime: '是', totalHours: 1, designQuantity: 2 }) })
    expect(deliver).not.toHaveBeenCalled()
    expect(database.reviews.get(reviewId)).toMatchObject({ modelStatus: 'skipped', notificationStatus: 'not-required', violations: [] })
    database.close()
  })
})
