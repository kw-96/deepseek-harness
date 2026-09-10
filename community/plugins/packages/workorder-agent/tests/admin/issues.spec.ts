import { describe, expect, it } from 'vitest'
import { issueFieldText, toAdminIssue } from '../../src/plugins/admin/issues.js'
import type { IssueSnapshot } from '../../src/domain/types.js'

const issue: IssueSnapshot = {
  id: 49678, projectName: '渠道美术', subject: '主题', submitterName: '提单人', assigneeName: '用户', statusName: '美术完成',
  gameProduct: '游戏', expectedDeliveryDate: '2026-08-14', artCategory: '子单',
  deliveryChannel: { name: '渠道A' }, returnDeliveryChannel: '', aiDeliveryChannel: '',
  aiPipelineTime: '是', totalHours: '1.00', designQuantity: { value: 3 },
  startDate: '2026-08-01', dueDate: '2026-08-10', createdOn: '2026-08-01T00:00:00.000Z',
  updatedOn: '2026-08-10T00:00:00.000Z', closedOn: '',
}

describe('控制面工单展示', () => {
  it('把对象字段展开为文本，总工时不附加单位', () => {
    expect(issueFieldText({ name: '渠道A' })).toBe('渠道A')
    expect(issueFieldText([{ name: '甲' }, { value: '乙' }])).toBe('甲、乙')
    expect(issueFieldText('1.00')).toBe('1.00')
    expect(issueFieldText('1.00')).not.toContain('小时')
  })

  it('生成带易协作详情地址的展示结构', () => {
    const view = toAdminIssue(issue, 'gcp.example.com')
    expect(view.url).toBe('https://gcp.example.com/v6/issues/49678')
    expect(view.submitterName).toBe('提单人')
    expect(view.deliveryChannel).toBe('渠道A')
    expect(view.designQuantity).toBe('3')
    expect(view.totalHours).toBe('1.00')
    expect(view.dueDate).toBe('2026-08-10')
  })
})
