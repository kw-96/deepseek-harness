import { describe, expect, it } from 'vitest'
import { buildIssueReviewMessage } from '../../src/domain/message.js'
import { buildTestNotification } from '../../src/domain/testNotification.js'
import type { IssueSnapshot } from '../../src/domain/types.js'

function issue(partial: Partial<IssueSnapshot> = {}): IssueSnapshot {
  return {
    id: 49100, projectName: '渠道美术', subject: '测试工单', submitterName: 'K匡振威',
    submitterEmail: 'kuangzhenwei01@corp.netease.com', assigneeName: 'S邵灵玉', assigneeEmail: '',
    statusName: '美术完成', gameProduct: '蛋仔派对', expectedDeliveryDate: '2026-09-10', artCategory: '资源位',
    deliveryChannel: '', returnDeliveryChannel: '', aiDeliveryChannel: '', aiPipelineTime: '是',
    totalHours: 1, designQuantity: 1, startDate: '', dueDate: '', createdOn: '', updatedOn: '', closedOn: '',
    ...partial,
  }
}

const violations = [{ ruleId: 'required-fields', message: '未填写总工时' }]

describe('工单补全提醒文案与接收人', () => {
  it('单聊提醒称呼指派给设计师，并把指派给邮箱作为本次接收人', () => {
    const result = buildIssueReviewMessage(
      issue({ assigneeName: 'S邵灵玉', assigneeEmail: 'shaolingyu01@corp.netease.com' }),
      violations, '结论', 'promoteart.pm.netease.com',
    )
    expect(result.message).toContain('S邵灵玉：请补全易协作工单')
    expect(result.message).not.toContain('K匡振威')
    expect(result.message).not.toContain('@')
    expect(result.receiver).toBe('shaolingyu01@corp.netease.com')
  })

  it('缺少指派给邮箱时接收人为空串，交由发送器回退默认接收人', () => {
    const result = buildIssueReviewMessage(issue(), violations, '结论', 'promoteart.pm.netease.com')
    expect(result.message).toContain('S邵灵玉：请补全易协作工单')
    expect(result.receiver).toBe('')
  })

  it('测试通知正文使用接收人本身且不含 @ 占位', () => {
    const mail = buildTestNotification('someone@corp.netease.com')
    expect(mail.message).toContain('someone@corp.netease.com：')
    expect(mail.message).not.toContain('@ ')
    const group = buildTestNotification('12345678')
    expect(group.message).toContain('12345678：')
  })
})
