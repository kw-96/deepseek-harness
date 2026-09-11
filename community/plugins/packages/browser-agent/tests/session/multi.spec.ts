/**
 * 多会话测试：复合键、别名路由（包装器）、会话列表与 browser_session 的四个动作。
 */

import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BskSessionStore } from '../../src/host/store.js'
import { aliasOf, dshSessionOf, sessionKey } from '../../src/host/session/keys.js'
import { call, expectDeclaredKeys, makeHarness } from '../support/harness.js'
import { FakeRunner } from '../support/fake-runner.js'

describe('复合键', () => {
  it('默认会话不带后缀，其它别名带 ## 后缀，且可反解', () => {
    expect(sessionKey('dsh-1', '')).toBe('dsh-1')
    expect(sessionKey('dsh-1', 'default')).toBe('dsh-1')
    expect(sessionKey('dsh-1', 'work')).toBe('dsh-1##work')
    expect(dshSessionOf('dsh-1##work')).toBe('dsh-1')
    expect(aliasOf('dsh-1##work')).toBe('work')
    expect(dshSessionOf('dsh-1')).toBe('dsh-1')
    expect(aliasOf('dsh-1')).toBe('default')
  })
})

describe('多会话托管', () => {
  let store: BskSessionStore
  let runner: FakeRunner

  beforeEach(() => {
    runner = new FakeRunner()
    store = new BskSessionStore(runner, {
      idleTimeoutMs: 60_000,
      snapshotMaxChars: 1000,
      browserInstance: '',
      log: () => {},
    })
  })

  it('同一 DSH 会话下可开多个别名会话，活跃的排在最前', async () => {
    await store.ensure(store.activeKey('dsh-1'))
    store.setActiveAlias('dsh-1', 'work')
    await store.ensure(store.activeKey('dsh-1'))
    const entries = store.sessionsOf('dsh-1')
    expect(entries.map(entry => entry.alias)).toEqual(['work', 'default'])
    expect(entries[0]?.active).toBe(true)
    expect(entries[0]?.record.bskSessionId).not.toBe(entries[1]?.record.bskSessionId)
  })

  it('stopAllOf 结束全部别名并清掉活跃标记', async () => {
    await store.ensure(sessionKey('dsh-1', 'work'))
    await store.ensure(sessionKey('dsh-1', 'other'))
    store.setActiveAlias('dsh-1', 'work')
    const stopped = await store.stopAllOf('dsh-1', '测试')
    expect(stopped.sort()).toEqual(['dsh-1##other', 'dsh-1##work'])
    expect(store.sessionsOf('dsh-1')).toEqual([])
    expect(store.activeKey('dsh-1')).toBe('dsh-1')
  })

  it('孤儿回收按 DSH 会话判定，别名会话同样被回收', async () => {
    const tracked = new BskSessionStore(runner, {
      idleTimeoutMs: 60_000,
      snapshotMaxChars: 1000,
      browserInstance: '',
      isOwnerAlive: dshSessionId => dshSessionId !== 'gone',
      log: () => {},
    })
    await tracked.ensure(sessionKey('gone', 'work'))
    await tracked.ensure(sessionKey('alive', 'work'))
    expect(await tracked.reapOrphaned()).toEqual(['gone##work'])
    expect(tracked.get('gone##work')).toBeUndefined()
    expect(tracked.get('alive##work')).toBeDefined()
  })
})

describe('别名路由', () => {
  it('传 session 时命令发到该别名会话，不传则用活跃会话', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com', session: 'work' })
    const workEntry = harness.store.sessionsOf('sess-1').find(entry => entry.alias === 'work')
    expect(workEntry).toBeDefined()
    expect(harness.store.sessionsOf('sess-1').map(entry => entry.alias)).toEqual(['work'])
    // 不传 session 时走「当前活跃会话」——此时仍是默认会话，于是开出一个新会话
    await call(harness, 'browser_open', { url: 'https://example.com' })
    const after = harness.store.sessionsOf('sess-1')
    expect(after.map(entry => entry.alias).sort()).toEqual(['default', 'work'])
    expect(after.find(entry => entry.alias === 'default')?.active).toBe(true)
    expect(new Set(after.map(entry => entry.record.bskSessionId)).size).toBe(2)
  })
})

describe('browser_session 工具', () => {
  it('list → new → use → close 的完整流程', async () => {
    const harness = makeHarness()
    const empty = await call(harness, 'browser_session', { action: 'list' })
    expectDeclaredKeys(harness, 'browser_session', empty)
    expect(String(empty['message'])).toContain('没有浏览器会话')

    const created = await call(harness, 'browser_session', { action: 'new', alias: 'work' })
    expect(created['activeAlias']).toBe('work')
    expect(created['sessions']).toBe(1)

    await expect(call(harness, 'browser_session', { action: 'new', alias: 'default' })).rejects.toThrow(/保留名/)
    await expect(call(harness, 'browser_session', { action: 'new', alias: 'work' })).rejects.toThrow(/已存在/)
    await expect(call(harness, 'browser_session', { action: 'new', alias: 'default' })).rejects.toThrow(/保留名/)

    await call(harness, 'browser_session', { action: 'new', alias: 'mail' })
    const used = await call(harness, 'browser_session', { action: 'use', alias: 'work' })
    expect(used['activeAlias']).toBe('work')
    expect(String(used['aliases'])).toContain('mail')

    const closed = await call(harness, 'browser_session', { action: 'close', alias: 'mail' })
    expect(closed['sessions']).toBe(1)
    const active = await call(harness, 'browser_session', { action: 'close' })
    expect(active['sessions']).toBe(0)
    expect(active['activeAlias']).toBe('default')
    await expect(call(harness, 'browser_session', { action: 'use', alias: 'nope' })).rejects.toThrow(/不存在/)
  })

  it('new 时可顺带打开页面', async () => {
    const harness = makeHarness()
    const created = await call(harness, 'browser_session', { action: 'new', alias: 'work', url: 'https://example.com' })
    expect(String(created['message'])).toContain('example.com')
    const entry = harness.store.sessionsOf('sess-1')[0]
    expect(entry?.record.currentUrl).toContain('example.com')
  })
})
