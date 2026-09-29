import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { VivoCase, VivoRun } from './types.js'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim()
}

function count(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}

/**
 * 解析点击率文本为百分数数值；非法值返回 undefined。
 * @param value 形如 "1.30%" 的文本
 * @returns 百分数数值或 undefined
 */
export function parseCtr(value: unknown): number | undefined {
  const normalized = String(value ?? '').trim().replace('%', '').trim()
  if (normalized === '') return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * 把一轮 data.json 解析为轮次信息与案例列表。
 * 兼容两种历史结构：结果项自带 case 对象，或旧版的 rank1 对象。
 * @param payload data.json 内容
 * @param runId 轮次目录名
 * @returns 轮次与案例
 */
export function parseRun(payload: unknown, runId: string): { run: VivoRun; cases: VivoCase[] } {
  const body = record(payload)
  const collectedAt = text(body.collected_at)
  const rawResults = Array.isArray(body.results) ? body.results : []
  const cases: VivoCase[] = []
  rawResults.forEach((item, index) => {
    const entry = record(item)
    const detail = record(entry.case ?? entry.rank1)
    const game = text(detail.matched_game ?? detail.name)
    const ctrText = text(detail.ctr)
    const ctr = parseCtr(ctrText)
    if (!game || ctr === undefined) return
    const screenshot = text(entry.screenshot)
    cases.push({
      runId,
      seq: index + 1,
      game,
      name: text(detail.name),
      ctr,
      ctrText: ctrText.endsWith('%') ? ctrText : `${ctrText}%`,
      tab: text(entry.tab),
      category: text(entry.category),
      position: text(entry.position),
      caseDate: text(entry.date),
      rank: count(entry.rank),
      imageUrl: text(detail.image),
      screenshot: screenshot ? basename(screenshot) : '',
      collectedAt,
    })
  })
  const targets = Array.isArray(body.targets)
    ? body.targets.map(text).filter(Boolean)
    : [...new Set(cases.map((item) => item.game))]
  const failed = Array.isArray(body.failed_combinations) ? body.failed_combinations.length : 0
  return {
    run: {
      id: runId,
      collectedAt,
      site: text(body.site),
      targets,
      status: text(body.status) || (cases.length > 0 ? 'ok' : 'unknown'),
      ...(text(body.error) ? { error: text(body.error) } : {}),
      caseCount: count(body.count) || cases.length,
      scannedCount: Array.isArray(body.scanned) ? body.scanned.length : 0,
      failedCount: failed,
      outputDir: text(body.output_dir),
    },
    cases,
  }
}

/**
 * 扫描采集输出目录下的全部轮次。
 * @param outputDir vivo-data 的 output 目录
 * @returns 按采集时间倒序的轮次与其案例
 */
export function scanOutput(outputDir: string): Array<{ run: VivoRun; cases: VivoCase[] }> {
  let entries: string[]
  try {
    entries = readdirSync(outputDir)
  } catch {
    // 目录不存在或不可读：视为尚无采集结果。
    return []
  }
  const runs: Array<{ run: VivoRun; cases: VivoCase[] }> = []
  for (const entry of entries.sort().reverse()) {
    const file = join(outputDir, entry, 'data.json')
    try {
      if (!statSync(join(outputDir, entry)).isDirectory()) continue
      const parsed = parseRun(JSON.parse(readFileSync(file, 'utf8')), entry)
      runs.push(parsed)
    } catch {
      // 缺少或损坏的 data.json 跳过，不影响其它轮次。
      continue
    }
  }
  return runs
}
