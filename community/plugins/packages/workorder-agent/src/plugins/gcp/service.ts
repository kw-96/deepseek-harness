import type { IssueSnapshot, ProjectName } from '../../domain/types.js'
import { GcpClient } from './client.js'
import { mapListIssue, parseIssuePage } from './mapper.js'

export type ProjectMap = Record<ProjectName, number>

/** 工单快照缓存，按远端更新时间决定是否覆盖本地记录。 */
export interface IssueSnapshotCache {
  get(id: number): IssueSnapshot | undefined
  upsert(issue: IssueSnapshot): void
}

const LIST_COLUMNS = [
  'id', 'subject', 'status', 'assigned_to', 'project',
  'start_date', 'due_date', 'created_on', 'updated_on', 'closed_on', 'spent_hours',
  'cf_7', 'cf_127', 'cf_128', 'cf_129', 'cf_134', 'cf_2000', 'cf_2002', 'cf_2005',
]

/** 封装三项目分页查询；列表直出字段，更新时间未变则复用本地快照。 */
export class GcpIssueService {
  constructor(
    private readonly client: GcpClient,
    private readonly projects: ProjectMap,
    private readonly completedStatusId: number,
    private readonly cache?: IssueSnapshotCache,
  ) {
    if (!Number.isInteger(completedStatusId) || completedStatusId <= 0) {
      throw new Error('美术完成状态 ID 必须为正整数')
    }
  }

  /** 查询日期范围内且当前状态为美术完成的工单。 */
  async listCompleted(startDate: string, endDate: string): Promise<IssueSnapshot[]> {
    const snapshots: IssueSnapshot[] = []
    for (const [projectName, projectId] of Object.entries(this.projects) as [ProjectName, number][]) {
      let fetched = 0
      let expectedTotal: number | undefined
      for (let page = 1; page <= 10_000; page += 1) {
        const result = parseIssuePage(await this.client.call('list_issues', {
          project_id: projectId,
          set_filter: 1,
          page,
          per_page: 100,
          sort: 'id:asc',
          c: LIST_COLUMNS,
          filter_mode: 'simple',
          filters: {
            cf_7: { operator: '><', values: [startDate, endDate] },
            status_id: { operator: '=', values: [String(this.completedStatusId)] },
          },
        }))
        if (expectedTotal === undefined) expectedTotal = result.totalCount
        if (result.totalCount !== expectedTotal) throw new Error('易协作分页 total_count 在查询期间发生变化')
        fetched += result.itemCount
        for (const item of result.items) {
          const snapshot = this.resolve(item, projectName)
          if (snapshot.statusName === '美术完成') snapshots.push(snapshot)
        }
        if (fetched >= expectedTotal) break
        if (result.itemCount === 0) throw new Error('易协作分页未覆盖 total_count 即返回空页')
        if (page === 10_000) throw new Error('易协作分页超过安全上限')
      }
    }
    return snapshots
  }

  private resolve(row: unknown, projectName: string): IssueSnapshot {
    const listed = mapListIssue(row, projectName)
    const cached = this.cache?.get(listed.id)
    if (cached && listed.updatedOn && cached.updatedOn === listed.updatedOn) return cached
    this.cache?.upsert(listed)
    return listed
  }
}
