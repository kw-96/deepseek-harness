import { beforeEach, describe, expect, it } from 'vitest'
import { SessionMetaStore } from '../../src/client/session-meta.js'
import { BrowserPrefsStore } from '../../src/client/sidebar/prefs.js'
import { orderProjects, pathKey, projectForPath, sortSessionIds } from '../../src/client/sidebar/groups.js'
import type { ProjectView, SessionId, SessionListStateLike } from '../../src/client/faces.js'

const sid = (id: string) => id as SessionId

/** 构造最小会话列表快照：列表顺序即 ids 顺序。 */
function list(...rows: { id: string; updatedAt: number }[]): SessionListStateLike {
  return {
    ids: rows.map(row => sid(row.id)),
    byId: Object.fromEntries(rows.map(row => [row.id, {
      id: sid(row.id),
      displayTitle: row.id,
      running: false,
      blank: false,
      updatedAt: row.updatedAt,
    }])),
    current: undefined,
    phase: 'ready',
  }
}

const state = list(
  { id: 'pinned-old', updatedAt: 10 },
  { id: 'unpinned-new', updatedAt: 40 },
  { id: 'pinned-new', updatedAt: 30 },
  { id: 'unpinned-old', updatedAt: 20 },
)

describe('sortSessionIds', () => {
  it('置顶优先：置顶先于未置顶，置顶之间按最近更新，未置顶也按最近更新', () => {
    const meta = new SessionMetaStore()
    meta.set(sid('pinned-old'), { pinned: true })
    meta.set(sid('pinned-new'), { pinned: true })
    const sorted = sortSessionIds(state.ids, state, meta, 'pinnedFirst')
    expect(sorted.map(id => id as string)).toEqual([
      'pinned-new', 'pinned-old', 'unpinned-new', 'unpinned-old',
    ])
  })

  it('多个置顶之间按最近更新排列', () => {
    const meta = new SessionMetaStore()
    meta.set(sid('pinned-old'), { pinned: true })
    meta.set(sid('pinned-new'), { pinned: true })
    const sorted = sortSessionIds(state.ids, state, meta, 'pinnedFirst')
    expect(sorted[0]).toBe(sid('pinned-new'))
    expect(sorted[1]).toBe(sid('pinned-old'))
  })

  it('最近更新模式不看置顶状态', () => {
    const meta = new SessionMetaStore()
    meta.set(sid('pinned-old'), { pinned: true })
    meta.set(sid('pinned-new'), { pinned: true })
    const sorted = sortSessionIds(state.ids, state, meta, 'recent')
    expect(sorted.map(id => id as string)).toEqual([
      'unpinned-new', 'pinned-new', 'unpinned-old', 'pinned-old',
    ])
  })

  it('手动模式保持列表顺序', () => {
    const meta = new SessionMetaStore()
    meta.set(sid('pinned-new'), { pinned: true })
    const sorted = sortSessionIds(state.ids, state, meta, 'manual')
    expect(sorted.map(id => id as string)).toEqual(state.ids.map(id => id as string))
  })

  it('同时刻回落到列表顺序，且不修改入参数组', () => {
    const ties = list(
      { id: 'tie-a', updatedAt: 5 },
      { id: 'tie-b', updatedAt: 5 },
    )
    const input = [...ties.ids]
    const sorted = sortSessionIds(ties.ids, ties, new SessionMetaStore(), 'recent')
    expect(sorted.map(id => id as string)).toEqual(['tie-a', 'tie-b'])
    expect(ties.ids).toEqual(input)
  })
})

const project = (id: string, updatedAt: string, roots: readonly string[] = []): ProjectView => ({
  projectId: id,
  name: id,
  roots,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
})

describe('orderProjects', () => {
  const projects: readonly ProjectView[] = [
    project('pinned-old', '2026-09-01T00:00:00.000Z'),
    project('recent-new', '2026-09-07T00:00:00.000Z'),
    project('pinned-new', '2026-09-05T00:00:00.000Z'),
    project('older', '2026-08-01T00:00:00.000Z'),
  ]
  // 偏好仓落在模块级内存回退里，文件内跨用例共享：每个用例前清空置顶状态。
  beforeEach(() => {
    const prefs = new BrowserPrefsStore()
    for (const entry of [...projects, project('idle-old', '2026-08-01T00:00:00.000Z')]) {
      prefs.setProjectPinned(entry.projectId, false)
    }
  })
  /** 最近活动：与注册表 updatedAt 故意相反，证明排序看活动而非注册表时间。 */
  const activity: Record<string, number> = {
    'pinned-old': Date.parse('2026-09-08T00:00:00.000Z'),
    'pinned-new': Date.parse('2026-09-02T00:00:00.000Z'),
    'recent-new': Date.parse('2026-09-06T00:00:00.000Z'),
    older: 0,
  }
  const recency = (projectId: string): number => activity[projectId] ?? 0

  it('置顶在前（置顶之间按最近活动），其余按最近活动', () => {
    const prefs = new BrowserPrefsStore()
    prefs.setProjectPinned('pinned-old', true)
    prefs.setProjectPinned('pinned-new', true)
    const ordered = orderProjects(projects, prefs, recency)
    expect(ordered.map(entry => entry.projectId)).toEqual([
      'pinned-old', 'pinned-new', 'recent-new', 'older',
    ])
  })

  it('未置顶项目之间同样按最近活动倒序', () => {
    const prefs = new BrowserPrefsStore()
    const ordered = orderProjects(projects, prefs, recency)
    expect(ordered.map(entry => entry.projectId)).toEqual([
      'pinned-old', 'recent-new', 'pinned-new', 'older',
    ])
  })

  it('没有会话活动的项目回退到注册表 updatedAt，且不修改入参数组', () => {
    const prefs = new BrowserPrefsStore()
    const idle: readonly ProjectView[] = [
      project('idle-old', '2026-08-01T00:00:00.000Z'),
      project('idle-new', '2026-09-01T00:00:00.000Z'),
    ]
    const ordered = orderProjects(idle, prefs, () => 0)
    expect(ordered.map(entry => entry.projectId)).toEqual(['idle-new', 'idle-old'])
    expect(idle.map(entry => entry.projectId)).toEqual(['idle-old', 'idle-new'])
  })
})

describe('projectForPath / pathKey', () => {
  const nested: readonly ProjectView[] = [
    project('outer', '2026-09-01T00:00:00.000Z', ['D:\\work']),
    project('inner', '2026-09-01T00:00:00.000Z', ['D:\\work\\inner']),
    project('empty-root', '2026-09-01T00:00:00.000Z', ['']),
  ]

  it('按最长 roots 前缀命中，且分隔符与大小写不敏感', () => {
    expect(projectForPath('D:\\work\\inner\\proj', nested)?.projectId).toBe('inner')
    expect(projectForPath('d:/work/other', nested)?.projectId).toBe('outer')
    expect(projectForPath('D:\\elsewhere', nested)).toBeUndefined()
  })

  it('空 root 永不匹配；pathKey 归一化分隔符与结尾分隔符', () => {
    expect(projectForPath('\\vendor', nested)).toBeUndefined()
    expect(pathKey('D:/work/')).toBe('d:\\work')
    expect(pathKey('D:\\work\\\\')).toBe('d:\\work')
  })
})
