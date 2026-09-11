import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserPrefsStore, DEFAULT_AUTO_ARCHIVE_DAYS } from '../../src/client/sidebar/prefs.js'

describe('BrowserPrefsStore 收起状态持久化', () => {
  beforeEach(() => {
    // 清空回退到内存的偏好仓，保证用例独立。
    const store = new BrowserPrefsStore()
    store.setCollapsedGroups([])
  })

  it('默认没有收起的组', () => {
    expect(new BrowserPrefsStore().collapsedGroups().size).toBe(0)
  })

  it('写入收起组后，新建实例（刷新/重启）能读回同一集合', () => {
    const first = new BrowserPrefsStore()
    first.setCollapsedGroups(['project:p1', 'ws:w1', 'archived'])
    const restored = new BrowserPrefsStore().collapsedGroups()
    expect([...restored].sort()).toEqual(['archived', 'project:p1', 'ws:w1'])
  })

  it('覆盖写入以最新集合为准', () => {
    const store = new BrowserPrefsStore()
    store.setCollapsedGroups(['project:p1', 'ws:w1'])
    store.setCollapsedGroups(['project:p1'])
    expect([...new BrowserPrefsStore().collapsedGroups()]).toEqual(['project:p1'])
  })

  it('项目置顶状态写入后，新建实例能读回并可取消', () => {
    const store = new BrowserPrefsStore()
    store.setProjectPinned('p1', true)
    store.setProjectPinned('p2', true)
    const restored = new BrowserPrefsStore()
    expect(restored.projectPinned('p1')).toBe(true)
    expect(restored.projectPinned('p2')).toBe(true)
    restored.setProjectPinned('p1', false)
    expect(new BrowserPrefsStore().projectPinned('p1')).toBe(false)
    expect(new BrowserPrefsStore().projectPinned('p2')).toBe(true)
  })

  it('自动归档阈值默认 30 天，写入后跨实例保持，且 0 表示关闭', () => {
    expect(new BrowserPrefsStore().autoArchiveDays).toBe(DEFAULT_AUTO_ARCHIVE_DAYS)
    const store = new BrowserPrefsStore()
    store.setAutoArchiveDays(14)
    expect(new BrowserPrefsStore().autoArchiveDays).toBe(14)
    store.setAutoArchiveDays(0)
    expect(new BrowserPrefsStore().autoArchiveDays).toBe(0)
    // 负数与非整数归一化：不低于 0 且取整。
    store.setAutoArchiveDays(-5)
    expect(new BrowserPrefsStore().autoArchiveDays).toBe(0)
    store.setAutoArchiveDays(7.8)
    expect(new BrowserPrefsStore().autoArchiveDays).toBe(7)
  })
})
