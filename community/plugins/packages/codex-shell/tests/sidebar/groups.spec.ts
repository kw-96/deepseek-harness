import { describe, expect, it } from 'vitest'
import { SessionMetaStore } from '../../src/client/session-meta.js'
import { BrowserPrefsStore } from '../../src/client/sidebar/prefs.js'
import { orderProjects, sortSessionIds } from '../../src/client/sidebar/groups.js'
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

const project = (id: string, updatedAt: string): ProjectView => ({
  projectId: id,
  name: id,
  roots: [],
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

  it('置顶优先：置顶在前（置顶之间按最近更新），其余按最近更新', () => {
    const prefs = new BrowserPrefsStore()
    prefs.setProjectPinned('pinned-old', true)
    prefs.setProjectPinned('pinned-new', true)
    const ordered = orderProjects(projects, prefs, 'pinnedFirst')
    expect(ordered.map(entry => entry.projectId)).toEqual([
      'pinned-new', 'pinned-old', 'recent-new', 'older',
    ])
  })

  it('最近更新模式不看置顶状态', () => {
    const prefs = new BrowserPrefsStore()
    prefs.setProjectPinned('pinned-old', true)
    const ordered = orderProjects(projects, prefs, 'recent')
    expect(ordered.map(entry => entry.projectId)).toEqual([
      'recent-new', 'pinned-new', 'pinned-old', 'older',
    ])
  })

  it('手动模式保持注册表顺序，且不修改入参数组', () => {
    const prefs = new BrowserPrefsStore()
    prefs.setProjectPinned('older', true)
    const ordered = orderProjects(projects, prefs, 'manual')
    expect(ordered.map(entry => entry.projectId)).toEqual(projects.map(entry => entry.projectId))
  })
})
