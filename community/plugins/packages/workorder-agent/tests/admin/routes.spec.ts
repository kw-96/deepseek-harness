import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../../src/config.js'
import type { IssueSnapshot } from '../../src/domain/types.js'
import { installAdminRoutes } from '../../src/plugins/admin/routes.js'
import { WorkorderStore } from '../../src/plugins/store/store.js'
import { IssueReviewWorkflow } from '../../src/plugins/workflow/review.js'

const directories: string[] = []

function database(): WorkorderStore {
  const directory = mkdtempSync(join(tmpdir(), 'workorder-admin-routes-'))
  directories.push(directory)
  return new WorkorderStore(join(directory, 'workorder.sqlite'))
}

const config: AppConfig = {
  port: 3081, dataDir: '', adminToken: 'admin', webhookToken: 'webhook',
  projects: { 渠道美术: 7, 回流业务: 2001, AI运营活动: 2004 }, completedStatusId: 6,
  gcp: { url: 'https://example.invalid/mcp', host: 'gcp.example.com', userKey: 'key' },
  popo: { url: 'https://example.invalid/popo' },
  review: { enabled: false, maxTokens: 800, knowledgeBase: '提单规范', notificationEnabled: false },
}

function issue(): IssueSnapshot {
  return {
    id: 101, projectName: '渠道美术', subject: '测试工单', submitterName: '提单人', assigneeName: '设计师',
    statusName: '美术完成', gameProduct: '测试游戏', expectedDeliveryDate: '2026-09-09', artCategory: '子单',
    deliveryChannel: '', returnDeliveryChannel: '', aiDeliveryChannel: '', aiPipelineTime: '', totalHours: '', designQuantity: '',
    startDate: '', dueDate: '', createdOn: '', updatedOn: '2026-09-09T10:00:00.000Z', closedOn: '',
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('工单控制面管理路由', () => {
  it('同步工单、执行填写核验并返回持久化记录', async () => {
    const store = database()
    const app = new Hono()
    const snapshot = issue()
    const issues = { listCompleted: vi.fn(async () => { store.issues.upsert(snapshot); return [snapshot] }) }
    const review = new IssueReviewWorkflow(store, { deliver: vi.fn() } as never, config.gcp.host, config.review)
    installAdminRoutes(app, {
      config, store, issues: issues as never, delivery: { resume: vi.fn() } as never,
      workflow: { sendTestNotification: vi.fn(), inspect: vi.fn(), sendPreview: vi.fn(), resendPreview: vi.fn() } as never,
      review, stats: { compute: vi.fn() } as never,
    })
    const synced = await app.request('/api/admin/issues/sync', { method: 'POST', body: JSON.stringify({ startDate: '2026-09-01', endDate: '2026-09-09' }), headers: { 'content-type': 'application/json' } })
    expect(synced.status).toBe(200)
    expect(await synced.json()).toMatchObject({ message: '已同步 1 张美术完成工单' })
    const reviewed = await app.request('/api/admin/issues/101/review', { method: 'POST' })
    expect(reviewed.status).toBe(200)
    const body = await reviewed.json() as { reviewId: string }
    const listed = await app.request('/api/admin/issue-reviews')
    expect(await listed.json()).toMatchObject({ items: [expect.objectContaining({ id: body.reviewId, issueId: 101, notificationStatus: 'disabled' })] })
    store.close()
  })

  it('校验并交由 Host 保存模型与知识库配置', async () => {
    const store = database()
    const app = new Hono()
    const writePluginSettings = vi.fn(async (): Promise<void> => undefined)
    installAdminRoutes(app, {
      config, store, issues: {} as never, delivery: {} as never, workflow: {} as never,
      review: {} as never, stats: {} as never, writePluginSettings,
    })
    const response = await app.request('/api/admin/review-settings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewEnabled: true, reviewProvider: 'provider', reviewModel: 'model', reviewMaxTokens: 800, reviewKnowledgeBase: '规范', reviewNotificationEnabled: true }),
    })
    expect(response.status).toBe(200)
    expect(writePluginSettings).toHaveBeenCalledWith(expect.objectContaining({ reviewProvider: 'provider', reviewModel: 'model' }))
    store.close()
  })
})
