import type { ProjectMap } from '../gcp/service.js'
import type { GcpClient } from '../gcp/client.js'
import { mapIssueDetail } from '../gcp/mapper.js'
import type { WorkorderStore } from '../store/store.js'
import type { IssueReviewWorkflow } from '../workflow/review.js'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {}
}

function displayPerson(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  const person = record(value)
  return String(person.name ?? person.login ?? person.display_name ?? '').trim()
}

function submitterFromWebhook(payloadJson: string, fallback: string): string {
  try {
    const body = record(JSON.parse(payloadJson))
    const issue = record(record(body.data).issue ?? body.issue)
    return [issue.author, issue.created_by, issue.creator, body.author, body.created_by]
      .map(displayPerson)
      .find(Boolean) ?? fallback
  } catch {
    return fallback
  }
}

/**
 * 判断编辑事件是否把状态改成了目标状态。
 * @param issue 载荷中的事件对象
 * @param statusId 目标状态 ID（美术完成）
 * @returns 是否存在指向该状态的状态变更
 */
function becomesStatus(issue: UnknownRecord, statusId: number): boolean {
  const changes = Array.isArray(issue.changes) ? issue.changes : []
  return changes.some((item) => {
    const change = record(item)
    if (String(change.prop_key ?? '') !== 'status_id') return false
    return Number(change.value ?? change.value_int) === statusId
  })
}

/** 事件接收结论；未接受时 reason 说明具体原因，供入口诊断记录使用。 */
export interface WebhookResult {
  accepted: boolean
  duplicate: boolean
  issueId?: number
  reason: string
  module: string
  event: string
  domain: string
  projectId?: number
}

/** 易协作事件接收、持久任务与 dry-run 处理服务。 */
export class GcpWebhookHandler {
  private timer?: NodeJS.Timeout
  private running = false
  private readonly projectsById: Map<number, string>
  private readonly projectIdsByName: Map<string, number>

  constructor(
    private readonly store: WorkorderStore,
    private readonly gcp: GcpClient,
    projects: ProjectMap,
    private readonly instanceHost: string,
    private readonly reviews: IssueReviewWorkflow,
    private readonly completedStatusId: number,
  ) {
    this.projectsById = new Map(Object.entries(projects).map(([name, id]) => [id, name]))
    this.projectIdsByName = new Map(Object.entries(projects).map(([name, id]) => [name, id]))
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
    // 易协作把事件对象放在 data 下；保留顶层回退以兼容旧载荷形态。
    const data = record(body.data)
    const issue = record(data.issue ?? body.issue)
    const moduleName = String(body.module ?? '').trim()
    const eventName = String(body.event ?? '').trim()
    const domain = String(instance.domain ?? body.instance_domain ?? '').trim()
    const rawProjectId = Number(record(issue.project).id ?? issue.project_id ?? body.project_id ?? data.project_id)
    const issueId = Number(issue.id ?? body.issue_id)
    // 编辑事件可能省略项目：回退到本地已入库快照的项目归属。
    const storedProject = Number.isInteger(issueId) ? this.store.issues.get(issueId)?.projectName : undefined
    const fallbackProjectId = storedProject === undefined ? undefined : this.projectIdsByName.get(storedProject)
    const parsedProjectId = Number.isInteger(rawProjectId) && rawProjectId > 0 ? rawProjectId : undefined
    const projectId = parsedProjectId ?? fallbackProjectId
    const identity = { module: moduleName, event: eventName, domain, projectId }
    const reject = (reason: string): WebhookResult => ({
      accepted: false, duplicate: false, reason, ...identity,
      ...Number.isInteger(issueId) ? { issueId } : {},
    })
    const isCreate = moduleName === 'issue' && eventName === 'create'
    const isCompleted = moduleName === 'issue' && eventName === 'update' && becomesStatus(issue, this.completedStatusId)
    if (!isCreate && !isCompleted) {
      if (moduleName === 'issue' && eventName === 'update') {
        return reject(`编辑事件未把状态改为「美术完成」，已忽略（收到 module=issue、event=update）`)
      }
      return reject(`仅处理「单/新增」与状态改为「美术完成」的编辑事件（收到 module=${moduleName || '空'}、event=${eventName || '空'}）`)
    }
    if (domain !== this.instanceHost) {
      return reject(`实例域不匹配（收到 ${domain || '空'}，期望 ${this.instanceHost}）`)
    }
    const traceId = String(body.trace_id ?? '').trim()
    if (!traceId) return reject('缺少 trace_id')
    if (!Number.isInteger(issueId)) return reject('缺少有效工单 ID')
    if (projectId === undefined || !this.projectsById.has(projectId)) {
      return reject(`项目不在白名单（收到项目 ID=${projectId ?? '空'}）`)
    }
    const saved = this.store.saveWebhook({ traceId, issueId, projectId, payloadJson: JSON.stringify(payload) })
    return {
      accepted: true, duplicate: !saved, issueId, ...identity,
      reason: saved ? '已接收并排队' : '重复事件，已忽略',
    }
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
      const mapped = mapIssueDetail(detail, projectName)
      const snapshot = {
        ...mapped,
        submitterName: submitterFromWebhook(task.payloadJson, mapped.submitterName || mapped.assigneeName),
      }
      this.store.issues.upsert(snapshot)
      const reviewId = await this.reviews.reviewIssue({ traceId: task.traceId, triggerType: 'webhook', issue: snapshot })
      const review = this.store.reviews.get(reviewId)
      this.store.completeWebhook(task, {
        mode: 'reviewed', issueId: snapshot.id, reviewId,
        notificationStatus: review?.notificationStatus,
      })
    } catch (error) {
      this.store.failWebhook(task, error instanceof Error ? error.message : String(error))
    } finally {
      this.running = false
    }
  }
}
