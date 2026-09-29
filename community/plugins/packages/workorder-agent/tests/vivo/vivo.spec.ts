import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkorderStore } from '../../src/plugins/store/store.js'
import { parseCtr, parseRun, scanOutput } from '../../src/plugins/vivo/sources.js'
import { VivoService, type VivoConfig } from '../../src/plugins/vivo/service.js'

const directories: string[] = []
const stores: WorkorderStore[] = []

function database(): WorkorderStore {
  const directory = mkdtempSync(join(tmpdir(), 'vivo-store-'))
  directories.push(directory)
  const store = new WorkorderStore(join(directory, 'workorder.sqlite'))
  stores.push(store)
  return store
}

/** 构造带若干采集轮次的项目目录。 */
function project(runs: Array<{ id: string; payload: unknown }>): string {
  const root = mkdtempSync(join(tmpdir(), 'vivo-project-'))
  directories.push(root)
  for (const { id, payload } of runs) {
    mkdirSync(join(root, 'output', id), { recursive: true })
    writeFileSync(join(root, 'output', id, 'data.json'), JSON.stringify(payload), 'utf8')
  }
  return root
}

function payload(collectedAt: string, cases: Array<{ game: string; ctr: string; image: string }>, extra: Record<string, unknown> = {}): unknown {
  return {
    site: 'vivo开放平台-资源位诊断-优秀案例',
    collected_at: collectedAt,
    targets: ['蛋仔派对'],
    status: 'ok',
    scanned: ['蛋仔派对 品类最佳/休闲益智/四号位卡片'],
    failed_combinations: [],
    count: cases.length,
    results: cases.map((item, index) => ({
      tab: '品类最佳', category: '休闲益智', position: '四号位卡片', date: '2026-09-07', rank: index + 1,
      case: { name: item.game, ctr: item.ctr, image: item.image, matched_game: item.game },
      screenshot: `./output\\20260907_114648\\case_${index}.png`,
    })),
    ...extra,
  }
}

const config = (projectDir: string): VivoConfig => ({
  projectDir,
  python: 'python',
  script: 'save_egg_party.py',
  defaultTargets: '蛋仔派对，梦幻西游',
})

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('vivo 采集结果解析', () => {
  it('解析当前结构并保留截图文件名与案例字段', () => {
    const { run, cases } = parseRun(payload('2026-09-07T11:46:48', [{ game: '蛋仔派对', ctr: '1.30%', image: 'https://img/a.jpg' }]), '20260907_114648')
    expect(run).toMatchObject({ id: '20260907_114648', status: 'ok', targets: ['蛋仔派对'], scannedCount: 1, caseCount: 1 })
    expect(cases[0]).toMatchObject({
      game: '蛋仔派对', ctr: 1.3, ctrText: '1.30%', position: '四号位卡片', category: '休闲益智',
      rank: 1, imageUrl: 'https://img/a.jpg', screenshot: 'case_0.png',
    })
  })

  it('兼容旧版 rank1 结构并从结果推导目标游戏', () => {
    const legacy = {
      collected_at: '2026-08-21T17:00:37',
      results: [{ tab: '品类最佳', category: '角色扮演', position: '静态闪屏', rank: 2, rank1: { name: '梦幻西游', ctr: '6.56%', image: 'https://img/b.jpg' } }],
    }
    const { run, cases } = parseRun(legacy, '20260821_170037')
    expect(run.targets).toEqual(['梦幻西游'])
    expect(cases[0]).toMatchObject({ game: '梦幻西游', ctr: 6.56, screenshot: '' })
  })

  it('点击率文本非法时返回 undefined', () => {
    expect(parseCtr('1.30%')).toBe(1.3)
    expect(parseCtr('')).toBeUndefined()
    expect(parseCtr('abc%')).toBeUndefined()
  })

  it('扫描目录时跳过缺失或损坏的 data.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'vivo-scan-'))
    directories.push(root)
    mkdirSync(join(root, 'output', '20260907_114648'), { recursive: true })
    writeFileSync(join(root, 'output', '20260907_114648', 'data.json'), JSON.stringify(payload('2026-09-07T11:46:48', [{ game: '蛋仔派对', ctr: '1.30%', image: 'a' }])), 'utf8')
    mkdirSync(join(root, 'output', '20260907_120000'), { recursive: true })
    writeFileSync(join(root, 'output', '20260907_120000', 'data.json'), '{ broken', 'utf8')
    mkdirSync(join(root, 'output', 'empty'), { recursive: true })
    const runs = scanOutput(join(root, 'output'))
    expect(runs.map((item) => item.run.id)).toEqual(['20260907_114648'])
  })
})

describe('vivo 入库、对比与采集', () => {
  it('同步历史并计算跨轮次差异', () => {
    const root = project([
      { id: '20260907_114648', payload: payload('2026-09-07T11:46:48', [{ game: '蛋仔派对', ctr: '1.30%', image: 'a' }]) },
      { id: '20260908_100000', payload: payload('2026-09-08T10:00:00', [
        { game: '蛋仔派对', ctr: '2.10%', image: 'a' },
        { game: '梦幻西游', ctr: '6.56%', image: 'b' },
      ]) },
    ])
    const service = new VivoService(database(), config(root))
    expect(service.sync()).toEqual({ runs: 2, cases: 3 })
    const latest = service.compare()
    const repeated = latest.find((item) => item.game === '蛋仔派对')
    const fresh = latest.find((item) => item.game === '梦幻西游')
    expect(repeated).toMatchObject({ previousCtr: 1.3, delta: 0.8, isNew: false })
    expect(fresh).toMatchObject({ isNew: true })
    expect(fresh?.previousCtr).toBeUndefined()
    const overview = service.overview()
    expect(overview.configured).toBe(true)
    expect(overview.summary).toMatchObject({ runs: 2, cases: 3, averageCtr: 3.32 })
    expect(overview.facets.positions).toEqual(['四号位卡片'])
    expect(overview.targets).toEqual(['蛋仔派对', '梦幻西游'])
  })

  it('按游戏与资源位筛选案例', () => {
    const root = project([{ id: '20260908_100000', payload: payload('2026-09-08T10:00:00', [
      { game: '蛋仔派对', ctr: '1.30%', image: 'a' },
      { game: '梦幻西游', ctr: '6.56%', image: 'b' },
    ]) }])
    const service = new VivoService(database(), config(root))
    service.sync()
    expect(service.overview({ game: '梦幻西游' }).cases).toHaveLength(1)
    expect(service.overview({ position: '静态闪屏' }).cases).toHaveLength(0)
  })

  it('未配置项目目录时拒绝采集，且采集状态可读', () => {
    const service = new VivoService(database(), config(''))
    expect(service.configured()).toBe(false)
    expect(service.sync()).toEqual({ runs: 0, cases: 0 })
    const result = service.collect(['蛋仔派对'])
    expect(result.started).toBe(false)
    expect(result.reason).toContain('未配置')
    expect(service.collectState()).toMatchObject({ running: false, log: [] })
    expect(service.stopCollect()).toMatchObject({ stopped: false })
  })

  it('推送最近一轮案例到 POPO', async () => {
    const root = project([
      { id: '20260907_114648', payload: payload('2026-09-07T11:46:48', [{ game: '蛋仔派对', ctr: '1.30%', image: 'a' }]) },
      { id: '20260908_100000', payload: payload('2026-09-08T10:00:00', [{ game: '蛋仔派对', ctr: '2.10%', image: 'a' }]) },
    ])
    const deliver = vi.fn(async () => ({ status: 'sent', taskId: 'task-1' }))
    const service = new VivoService(database(), config(root), { deliver } as never)
    service.sync()
    const result = await service.notify()
    expect(result.taskId).toBe('task-1')
    expect(result.message).toContain('蛋仔派对')
    expect(result.message).toContain('较上轮 +0.8%')
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'vivo-cases', sourceId: '20260908_100000' }))
  })
})
