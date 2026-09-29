import type Database from 'better-sqlite3'
import type { VivoCase, VivoRun, VivoSummary } from './types.js'

/** 案例对比键：同一游戏、资源位与素材视为同一条案例。 */
export function caseKey(game: string, position: string, imageUrl: string, name: string): string {
  return `${game}|${position}|${imageUrl || name}`
}

interface CaseRow {
  runId: string
  seq: number
  game: string
  name: string
  ctr: number
  ctrText: string
  tab: string
  category: string
  position: string
  caseDate: string
  rank: number
  imageUrl: string
  screenshot: string
  collectedAt: string
}

function toCase(row: CaseRow): VivoCase {
  return { ...row }
}

const CASE_COLUMNS = `run_id runId, seq, game, name, ctr, ctr_text ctrText, tab, category,
  position, case_date caseDate, rank, image_url imageUrl, screenshot, collected_at collectedAt`

/** vivo 优秀案例的持久化仓库。 */
export class VivoRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * 覆盖写入一轮采集及其案例。
   * @param run 轮次信息
   * @param cases 该轮案例
   */
  saveRun(run: VivoRun, cases: VivoCase[]): void {
    const write = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO vivo_runs(id,collected_at,site,targets_json,status,error,case_count,
        scanned_count,failed_count,output_dir,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET collected_at=excluded.collected_at,site=excluded.site,
        targets_json=excluded.targets_json,status=excluded.status,error=excluded.error,
        case_count=excluded.case_count,scanned_count=excluded.scanned_count,
        failed_count=excluded.failed_count,output_dir=excluded.output_dir,synced_at=excluded.synced_at`)
        .run(run.id, run.collectedAt, run.site, JSON.stringify(run.targets), run.status, run.error ?? null,
          run.caseCount, run.scannedCount, run.failedCount, run.outputDir, new Date().toISOString())
      this.db.prepare('DELETE FROM vivo_cases WHERE run_id=?').run(run.id)
      const insert = this.db.prepare(`INSERT INTO vivo_cases(run_id,seq,game,name,ctr,ctr_text,tab,category,
        position,case_date,rank,image_url,screenshot,collected_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      for (const item of cases) {
        insert.run(item.runId, item.seq, item.game, item.name, item.ctr, item.ctrText, item.tab, item.category,
          item.position, item.caseDate, item.rank, item.imageUrl, item.screenshot, item.collectedAt)
      }
    })
    write()
  }

  /** 返回最近采集轮次。 */
  listRuns(limit = 50): VivoRun[] {
    const rows = this.db.prepare(`SELECT id, collected_at collectedAt, site, targets_json targetsJson,
      status, error, case_count caseCount, scanned_count scannedCount, failed_count failedCount,
      output_dir outputDir FROM vivo_runs ORDER BY id DESC LIMIT ?`).all(limit) as Array<Omit<VivoRun, 'targets'> & { targetsJson: string }>
    return rows.map(({ targetsJson, ...row }) => ({
      ...row,
      targets: JSON.parse(targetsJson) as string[],
    }))
  }

  /** 判断该轮次是否已入库。 */
  hasRun(id: string): boolean {
    return this.db.prepare('SELECT 1 FROM vivo_runs WHERE id=?').get(id) !== undefined
  }

  /**
   * 按条件列出案例。
   * @param filter 轮次、游戏、资源位与条数上限
   * @returns 案例列表，按点击率倒序
   */
  listCases(filter: { runId?: string; game?: string; position?: string; limit?: number } = {}): VivoCase[] {
    const where: string[] = []
    const values: unknown[] = []
    if (filter.runId) { where.push('run_id=?'); values.push(filter.runId) }
    if (filter.game) { where.push('game=?'); values.push(filter.game) }
    if (filter.position) { where.push('position=?'); values.push(filter.position) }
    const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 200), 1), 1000)
    const rows = this.db.prepare(`SELECT ${CASE_COLUMNS} FROM vivo_cases
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ctr DESC, run_id DESC, seq ASC LIMIT ?`).all(...values, limit) as CaseRow[]
    return rows.map(toCase)
  }

  /**
   * 读取指定轮次之前各案例键的历史最高点击率。
   * 轮次目录名按时间递增，直接以字符串比较确定先后。
   * @param runId 目标轮次
   * @returns 案例键到历史最高点击率的映射
   */
  bestCtrBefore(runId: string): Map<string, number> {
    const rows = this.db.prepare(`SELECT game, position, image_url imageUrl, name, MAX(ctr) ctr
      FROM vivo_cases WHERE run_id < ? GROUP BY game, position, image_url, name`).all(runId) as Array<{
      game: string; position: string; imageUrl: string; name: string; ctr: number
    }>
    const map = new Map<string, number>()
    for (const row of rows) map.set(caseKey(row.game, row.position, row.imageUrl, row.name), row.ctr)
    return map
  }

  /** 返回案例明细的筛选维度取值。 */
  facets(): { games: string[]; positions: string[] } {
    const games = this.db.prepare('SELECT DISTINCT game FROM vivo_cases ORDER BY game').all() as Array<{ game: string }>
    const positions = this.db.prepare('SELECT DISTINCT position FROM vivo_cases ORDER BY position').all() as Array<{ position: string }>
    return { games: games.map((row) => row.game), positions: positions.map((row) => row.position) }
  }

  /**
   * 返回最近一轮的去重案例集合：同一「游戏 + 资源位 + 素材」只保留最高点击率。
   * 与既有 dashboard 的口径一致。
   * @param runId 轮次；缺省取最新一轮
   */
  bestCases(runId?: string): VivoCase[] {
    const target = runId ?? this.listRuns(1)[0]?.id
    if (!target) return []
    const rows = this.db.prepare(`SELECT ${CASE_COLUMNS} FROM vivo_cases c
      WHERE c.run_id=?
      ORDER BY c.ctr DESC, c.seq ASC`).all(target) as CaseRow[]
    const seen = new Map<string, VivoCase>()
    for (const row of rows) {
      const item = toCase(row)
      const key = caseKey(item.game, item.position, item.imageUrl, item.name)
      if (!seen.has(key)) seen.set(key, item)
    }
    return [...seen.values()]
  }

  /** 返回看板汇总。 */
  summary(): VivoSummary {
    const runs = this.db.prepare('SELECT COUNT(*) total FROM vivo_runs').get() as { total: number }
    const cases = this.db.prepare('SELECT COUNT(*) total, AVG(ctr) average FROM vivo_cases').get() as { total: number; average: number | null }
    const latest = this.db.prepare('SELECT collected_at value FROM vivo_runs ORDER BY id DESC LIMIT 1').get() as { value: string } | undefined
    return {
      runs: runs.total,
      cases: cases.total,
      averageCtr: cases.average === null ? 0 : Math.round(cases.average * 100) / 100,
      ...(latest ? { latest: latest.value } : {}),
    }
  }
}
