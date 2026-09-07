import { inspectIssue } from '../../domain/rules.js'
import type { ProjectMap } from '../gcp/service.js'
import type { GcpClient } from '../gcp/client.js'
import { mapIssueDetail } from '../gcp/mapper.js'
import type { WorkorderStore } from '../store/store.js'
import type { WorkorderAgentRouter } from '../../harness/agent.js'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {}
}

export interface WebhookResult {
  accepted: boolean
  duplicate: boolean
  issueId?: number
}

/** 易协作事件接收、持久任务与 dry-run 处理服务。 */
export class GcpWebhookHandler {
  private timer?: NodeJS.Timeout
  private running = false
  private readonly projectsById: Map<number, string>

  constructor(
    private readonly store: WorkorderStore,
    private readonly gcp: GcpClient,
    projects: ProjectMap,
    private readonly instanceHost: string,
    private readonly agentRouter?: WorkorderAgentRouter,
  ) {
    this.projectsById = new Map(Object.entries(projects).map(([name, id]) => [id, name]))
  }

  /** 启动持久任务轮询器。 */
  start(): void {
    this.timer = setInterval(() => this.processNext().catch((error: unknown) => {
      console.error('Webhook 后台任务处理异常', error)
    }), 500)
  }

  /** 停止持久任务轮询器。 */
  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  /** 返回后台任务轮询器是否处于运行状态。 */
  isReady(): boolean {
    return this.timer !== undefined
  }

  /** 校验事件并持久入队，后续由后台有限重试。 */
  accept(payload: unknown): WebhookResult {
    const body = record(payload)
    const instance = record(body.instance)
    const issue = record(body.issue)
    const host = String(instance.domain ?? body.instance_domain ?? '').trim()
    const projectId = Number(record(issue.project).id ?? issue.project_id ?? body.project_id)
    if (body.module !== 'issue' || body.event !== 'create' || host !== this.instanceHost) {
      return { accepted: false, duplicate: false }
    }
    const traceId = String(body.trace_id ?? '').trim()
    const issueId = Number(issue.id ?? body.issue_id)
    if (!traceId || !Number.isInteger(issueId) || !this.projectsById.has(projectId)) {
      return { accepted: false, duplicate: false }
    }
    const saved = this.store.saveWebhook({ traceId, issueId, projectId, payloadJson: JSON.stringify(payload) })
    return { accepted: true, duplicate: !saved, issueId }
  }

  private async processNext(): Promise<void> {
    if (this.running || !this.store.getFlag('webhook_processing_enabled')) return
    const task = this.store.claimWebhook()
    if (!task) return
    this.running = true
    try {
      const projectName = this.projectsById.get(task.projectId)
      if (!projectName) throw new Error('Webhook 项目不在白名单')
      const detail = await this.gcp.call('get_issue_base', { id: task.issueId })
      const snapshot = mapIssueDetail(detail, projectName)
      this.store.issues.upsert(snapshot)
      const violations = inspectIssue(snapshot).map((item) => ({ ruleId: item.ruleId, message: item.message }))
      await this.agentRouter?.routeWebhook(task.traceId, snapshot.id, projectName)
      this.store.completeWebhook(task, {
        mode: this.agentRouter ? 'agent-routed' : 'dry-run', issueId: snapshot.id, violations,
      })
    } catch (error) {
      this.store.failWebhook(task, error instanceof Error ? error.message : String(error))
    } finally {
      this.running = false
    }
  }
}
