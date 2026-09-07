import type { Violation } from './types.js'


/** 生成易协作工单详情地址。 */
export function issueUrl(host: string, issueId: number): string {
  const origin = /^https?:\/\//i.test(host) ? host : `https://${host}`
  return `${origin.replace(/\/$/, '')}/v6/issues/${issueId}`
}

/** 按指派人聚合正式巡检消息，并附加工单详情链接。 */
export function buildInspectionMessage(title: string, violations: Violation[], host: string): string | null {
  if (violations.length === 0) return null
  const grouped = new Map<string, Map<string, Set<number>>>()
  for (const item of violations) {
    const messages = grouped.get(item.assigneeName) ?? new Map<string, Set<number>>()
    const issueIds = messages.get(item.message) ?? new Set<number>()
    issueIds.add(item.issueId)
    messages.set(item.message, issueIds)
    grouped.set(item.assigneeName, messages)
  }
  const lines = [`【${title}】`]
  for (const [assignee, messages] of grouped) {
    lines.push(`${assignee}：`)
    for (const [message, issueIds] of messages) {
      const links = [...issueIds].map((issueId) => `[#${issueId}](${issueUrl(host, issueId)})`)
      lines.push(`${message}：${links.join('、')}`)
    }
    lines.push('')
  }
  lines.push('请相关同学及时完善工单字段。')
  return lines.join('\n')
}
