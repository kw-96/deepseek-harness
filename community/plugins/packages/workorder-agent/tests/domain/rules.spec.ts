import { describe, expect, it } from 'vitest'
import { inspectIssue } from '../../src/domain/rules.js'
import type { IssueSnapshot } from '../../src/domain/types.js'

const base: IssueSnapshot = {
  id: 1,
  projectName: '渠道美术',
  subject: '测试工单',
  assigneeName: '测试用户',
  statusName: '美术完成',
  gameProduct: '',
  expectedDeliveryDate: '2026-08-14',
  artCategory: '子单',
  deliveryChannel: '渠道A',
  returnDeliveryChannel: null,
  aiDeliveryChannel: null,
  aiPipelineTime: '是',
  totalHours: 1,
  designQuantity: 1,
  startDate: '',
  dueDate: '',
  createdOn: '',
  updatedOn: '',
  closedOn: '',
}

describe('设计工单规则', () => {
  it('跳过非美术完成状态', () => {
    expect(inspectIssue({ ...base, statusName: '进行中' })).toEqual([])
  })

  it('总单填写设计数量时提醒确认工单类型', () => {
    const result = inspectIssue({ ...base, artCategory: '总单' })
    expect(result.map((item) => item.ruleId)).toEqual(['total-order-design-quantity'])
    expect(result[0]?.message).toBe('请确认该工单是否为总单，总单不应填设计数量')
  })

  it('排除 2026-07-26 之前的工单并保留边界日期', () => {
    expect(inspectIssue({ ...base, expectedDeliveryDate: '2026-07-25', totalHours: 0 })).toEqual([])
    expect(inspectIssue({ ...base, expectedDeliveryDate: '2026-07-26', totalHours: 0 })[0]?.ruleId).toBe('required-fields')
  })

  it('不可解析或不存在的交付日期安全跳过', () => {
    expect(inspectIssue({ ...base, expectedDeliveryDate: '2026-02-30', totalHours: 0 })).toEqual([])
    expect(inspectIssue({ ...base, expectedDeliveryDate: '', totalHours: 0 })).toEqual([])
  })

  it('按项目检查对应渠道和正数字段', () => {
    const result = inspectIssue({
      ...base,
      projectName: '回流业务',
      returnDeliveryChannel: '',
      aiPipelineTime: '',
      totalHours: 0,
      designQuantity: null,
    })
    expect(result.map((item) => item.ruleId)).toEqual(['required-fields'])
    expect(result[0]?.message).toBe('未填写回流投放渠道、AI管线耗时、总工时、设计数量')
  })
})
