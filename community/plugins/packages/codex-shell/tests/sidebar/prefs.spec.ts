import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserPrefsStore } from '../../src/client/sidebar/prefs.js'

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
})
