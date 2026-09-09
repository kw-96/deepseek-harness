import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../../src/config.js'
import { mapIssueDetail, mapListIssue, parseIssuePage } from '../../src/plugins/gcp/mapper.js'
import { GcpIssueService } from '../../src/plugins/gcp/service.js'
import { issueDetailResponse, issueListItem, issueListResponse } from '../fixtures/gcpResponses.js'

function stubRequiredConfig(): void {
  vi.stubEnv('ADMIN_TOKEN', 'admin-token')
  vi.stubEnv('WEBHOOK_TOKEN', 'webhook-token')
  vi.stubEnv('GCP_USER_KEY', 'user-key')
  vi.stubEnv('POPO_WEBHOOK_URL', 'https://example.invalid/webhook')
}

describe('易协作配置契约', () => {
  it('使用已验证的项目与状态默认 ID，并允许项目环境覆盖', () => {
    stubRequiredConfig()
    vi.stubEnv('PROJECT_ID_CHANNEL_ART', '')
    vi.stubEnv('PROJECT_ID_RETURN_BUSINESS', '3001')
    vi.stubEnv('PROJECT_ID_AI_OPERATIONS', '')
    vi.stubEnv('GCP_COMPLETED_STATUS_ID', '')
    const config = loadConfig()
    expect(config.projects).toEqual({ 渠道美术: 7, 回流业务: 3001, AI运营活动: 2004 })
    expect(config.completedStatusId).toBe(6)
    vi.unstubAllEnvs()
  })
})

describe('易协作真实响应映射', () => {
  it('从 data.list 解析工单和分页元数据', () => {
    expect(parseIssuePage(issueListResponse)).toMatchObject({ ids: [81001, 81002], totalCount: 5, itemCount: 2 })
    expect(parseIssuePage(issueListResponse).items).toHaveLength(2)
  })

  it('映射列表行字段，并把 spent_hours 作为总工时', () => {
    expect(mapListIssue(issueListItem, '回流业务')).toMatchObject({
      id: 81001,
      projectName: '渠道美术',
      subject: '脱敏工单甲',
      submitterName: '',
      assigneeName: '脱敏用户',
      statusName: '美术完成',
      gameProduct: '脱敏游戏',
      expectedDeliveryDate: '2026-08-14',
      totalHours: 2.5,
      updatedOn: '2026-08-10T00:00:00.000Z',
      dueDate: '2026-08-10',
    })
  })

  it('映射 base、二维 core_fields 和 cf_fields，并归一化项目名', () => {
    expect(mapIssueDetail(issueDetailResponse, '错误回退项目')).toEqual({
      id: 81001,
      projectName: 'AI运营活动',
      subject: '脱敏工单甲',
      submitterName: '',
      assigneeName: '脱敏用户',
      statusName: '美术完成',
      gameProduct: '脱敏游戏',
      expectedDeliveryDate: '2026-08-14',
      artCategory: '子单',
      deliveryChannel: '脱敏渠道',
      returnDeliveryChannel: '',
      aiDeliveryChannel: '脱敏AI渠道',
      aiPipelineTime: '是',
      totalHours: '2.5',
      designQuantity: 3,
      startDate: '2026-08-01',
      dueDate: '2026-08-10',
      createdOn: '2026-08-01T00:00:00.000Z',
      updatedOn: '2026-08-10T00:00:00.000Z',
      closedOn: '2026-08-10T12:00:00.000Z',
    })
  })

  it('拒绝缺少 total_count 或 list 的响应', () => {
    expect(() => parseIssuePage({ data: {} })).toThrow('结构异常')
    expect(() => parseIssuePage({ data: { total_count: 1, list: 'bad' } })).toThrow('结构异常')
  })
})

describe('易协作完成状态查询', () => {
  it('使用列表列直出快照，不再逐条请求详情', async () => {
    const call = vi.fn(async (name: string) => {
      if (name === 'list_issues') {
        return {
          data: {
            total_count: 2,
            list: [
              { ...issueListItem, id: 1, status: '美术完成' },
              { id: 2, status: '进行中', updated_on: '2026-08-10T00:00:00.000Z' },
            ],
          },
        }
      }
      throw new Error(`意外调用 ${name}`)
    })
    const cache = { get: vi.fn(), upsert: vi.fn() }
    const service = new GcpIssueService(
      { call } as never,
      { 渠道美术: 7, 回流业务: 2001, AI运营活动: 2004 },
      6,
      cache,
    )
    const result = await service.listCompleted('2026-08-01', '2026-08-02')
    const listCalls = call.mock.calls.filter(([name]) => name === 'list_issues')
    expect(listCalls).toHaveLength(3)
    expect(listCalls[0]?.[1]).toMatchObject({
      sort: 'id:asc',
      c: expect.arrayContaining(['updated_on', 'spent_hours', 'cf_127']),
      filters: { status_id: { values: ['6'] } },
    })
    expect(result).toHaveLength(3)
    expect(result.every((issue) => issue.statusName === '美术完成')).toBe(true)
    expect(cache.upsert).toHaveBeenCalled()
  })

  it('更新时间未变化时复用本地快照且不覆盖', async () => {
    const cached = mapListIssue({ ...issueListItem, id: 1 }, '渠道美术')
    const call = vi.fn(async () => ({ data: { total_count: 1, list: [{ ...issueListItem, id: 1 }] } }))
    const cache = { get: vi.fn(() => cached), upsert: vi.fn() }
    const service = new GcpIssueService({ call } as never, { 渠道美术: 7, 回流业务: 2001, AI运营活动: 2004 }, 6, cache)
    const result = await service.listCompleted('2026-08-01', '2026-08-02')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(cached)
    expect(cache.upsert).not.toHaveBeenCalled()
  })
})
