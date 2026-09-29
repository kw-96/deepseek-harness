import { Cron } from 'croner'
import { previousWeekRange, todayInShanghai } from '../../domain/dates.js'
import type { InspectionWorkflow } from '../workflow/service.js'
import type { WorkorderStore } from '../store/store.js'

/** 注册每日和每周巡检调度；调度和自动发送分别控制且默认关闭。 */
export function startScheduler(workflow: InspectionWorkflow, store: WorkorderStore): () => void {
  const inspect = async (type: 'daily' | 'weekly'): Promise<void> => {
    if (!store.getFlag('schedule_enabled')) return
    const range = type === 'daily'
      ? { startDate: todayInShanghai(), endDate: todayInShanghai() }
      : previousWeekRange()
    await workflow.inspect({
      type, ...range, automatic: true,
      send: store.getFlag('automatic_send_enabled'),
    })
  }
  const daily = new Cron('0 18 * * *', { timezone: 'Asia/Shanghai' }, async () => inspect('daily'))
  const weekly = new Cron('0 9 * * 3', { timezone: 'Asia/Shanghai' }, async () => inspect('weekly'))
  return () => {
    daily.stop()
    weekly.stop()
  }
}
