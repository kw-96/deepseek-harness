import { describe, expect, it, vi } from 'vitest'
import type { IssueSnapshot } from '../../src/domain/types.js'
import type { PreviewRecord } from '../../src/plugins/store/store.js'
import { InspectionWorkflow } from '../../src/plugins/workflow/service.js'

const issue: IssueSnapshot = {
  id: 1, projectName: '渠道美术', subject: '测试', assigneeName: '用户', statusName: '美术完成',
  expectedDeliveryDate: '2026-08-01', artCategory: '子单', deliveryChannel: '', returnDeliveryChannel: null,
  aiDeliveryChannel: null, aiPipelineTime: '是', totalHours: 1, designQuantity: 1,
  gameProduct: '', startDate: '', dueDate: '', createdOn: '', updatedOn: '', closedOn: '',
}

function setup(deliver = vi.fn(async () => ({ status: 'sent' as const, taskId: 'task-id' }))): {
  workflow: InspectionWorkflow; deliver: typeof deliver
} {
  let preview: PreviewRecord | undefined
  const store = {
    saveRun: vi.fn(), savePreview: vi.fn((value: PreviewRecord): void => { preview = value }),
    getPreview: vi.fn((id: string): PreviewRecord | undefined => preview?.id === id ? preview : undefined),
    getActivePreview: vi.fn((id: string): PreviewRecord | undefined =>
      preview?.id === id && preview.status === 'pending' ? preview : undefined),
    markPreviewSent: vi.fn((id: string): boolean => {
      if (!preview || preview.id !== id || preview.status !== 'pending') return false
      preview.status = 'sent'
      return true
    }),
  }
  const issues = { listCompleted: vi.fn(async (): Promise<IssueSnapshot[]> => [issue, { ...issue, id: 2 }]) }
  return {
    workflow: new InspectionWorkflow(issues as never, store as never, { deliver } as never,
      'promoteart.pm.netease.com'),
    deliver,
  }
}

describe('正式预览发送闸门', () => {
  it('持久预览并仅发送绑定消息一次', async () => {
    const { workflow, deliver } = setup()
    const preview = await workflow.inspect({
      type: 'acceptance', startDate: '2026-08-01', endDate: '2026-08-01', send: false,
    })
    expect(preview.previewId).toBeTruthy()
    expect(preview.message).toContain('[#1](https://promoteart.pm.netease.com/v6/issues/1)')
    expect(deliver).not.toHaveBeenCalled()
    await expect(workflow.sendPreview(preview.previewId ?? '')).resolves.toMatchObject({ sent: true })
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ message: preview.message, sourceType: 'preview' }))
    await expect(workflow.sendPreview(preview.previewId ?? '')).rejects.toThrow('已过期或已发送')
  })

  it('发送失败后保留预览并允许重试', async () => {
    const deliver = vi.fn().mockRejectedValueOnce(new Error('网络失败'))
      .mockResolvedValueOnce({ status: 'sent', taskId: 'task-id' })
    const { workflow } = setup(deliver)
    const preview = await workflow.inspect({
      type: 'acceptance', startDate: '2026-08-01', endDate: '2026-08-01', send: false,
    })
    await expect(workflow.sendPreview(preview.previewId ?? '')).rejects.toThrow('网络失败')
    await expect(workflow.sendPreview(preview.previewId ?? '')).resolves.toMatchObject({ sent: true })
  })

  it('允许人工多次完整重发复核结果', async () => {
    const { workflow, deliver } = setup()
    const preview = await workflow.inspect({
      type: 'acceptance', startDate: '2026-08-01', endDate: '2026-08-01', send: false,
    })
    await workflow.sendPreview(preview.previewId ?? '')
    await expect(workflow.resendPreview(preview.previewId ?? '')).resolves.toBe('task-id')
    await expect(workflow.resendPreview(preview.previewId ?? '')).resolves.toBe('task-id')
    expect(deliver).toHaveBeenCalledTimes(3)
  })

  it('拒绝再次发送不存在的复核记录', async () => {
    const { workflow } = setup()
    await expect(workflow.resendPreview('00000000-0000-4000-8000-000000000000'))
      .rejects.toThrow('复核记录不存在')
  })

  it('每次点击均创建固定测试通知任务', async () => {
    const { workflow, deliver } = setup()
    await expect(workflow.sendTestNotification()).resolves.toBe('task-id')
    await expect(workflow.sendTestNotification()).resolves.toBe('task-id')
    expect(deliver).toHaveBeenCalledTimes(2)
  })
})
