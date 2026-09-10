import type { IssueSnapshot, Violation } from './types.js'


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

/** 生成面向提单人的单工单补全提醒文本。 */
export function buildIssueReviewMessage(
  issue: IssueSnapshot,
  violations: Array<{ ruleId: string; message: string }>,
  modelOutput: string,
  host: string,
): string {
  const submitter = issue.submitterName || issue.assigneeName || '相关提单人'
  return [
    '【工单补全提醒】',
    `@${submitter}：请补全易协作工单 [#${issue.id}](${issueUrl(host, issue.id)})。`,
    `规则核验：${violations.map((item) => item.message).join('；')}`,
    `模型审核：${modelOutput}`,
    '补全后可再次在工单控制面执行“填写核验”。',
  ].join('\n')
}
