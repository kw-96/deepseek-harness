/** 工具层测试（控制与安全）：状态、人工求助、脚本闸门、借用审批。 */

import { describe, expect, it } from 'vitest'
import { defaultOutcome, failure } from './support/fake-runner.js'
import { call, makeHarness } from './support/harness.js'

describe('控制工具', () => {
  it('状态汇总 daemon、浏览器与本会话窗口', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    const value = await call(harness, 'browser_status', {})
    expect(value['connected']).toBe(true)
    expect(value['sessionOpen']).toBe(true)
    expect(String(value['daemon'])).toContain('0.1.6')
  })

  it('人工求助解析处置结果并作废引用', async () => {
    const harness = makeHarness()
    harness.runner.responder = args => (args[0] === 'request-help'
      ? { stdout: '', stderr: '', exitCode: 0, json: { outcome: 'continued', note: '已登录' } }
      : defaultOutcome(args))
    const value = await call(harness, 'browser_ask_human', { prompt: '请登录', targets: ['@e2'] })
    expect(value['outcome']).toBe('continued')
    expect(harness.store.get('sess-1')?.refsStale).toBe(true)
    const ask = harness.runner.commands.find(command => command.args[0] === 'request-help')
    expect(ask?.args).toContain('@e2')
  })

  it('结束会话后状态回到未开启', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    const stopped = await call(harness, 'browser_stop', {})
    expect(String(stopped['message'])).toContain('已结束')
    expect(harness.store.get('sess-1')).toBeUndefined()
    const status = await call(harness, 'browser_status', {})
    expect(status['sessionOpen']).toBe(false)
  })

  it('标签页列表默认只看 Agent Window', async () => {
    const harness = makeHarness()
    const listed = await call(harness, 'browser_tabs', { action: 'list' })
    expect((listed['tabs'] as unknown[]).length).toBe(1)
    const list = harness.runner.commands.find(command => command.args[0] === 'tab')
    expect(list?.args).toContain('agent')
  })

  it('状态区分本插件会话与外部遗留会话', async () => {
    const harness = makeHarness()
    harness.runner.responder = args => (args[0] === 'session' && args[1] === 'list'
      ? { stdout: '', stderr: '', exitCode: 0, json: undefined, rows: [{ session_id: 'other1' }] }
      : defaultOutcome(args))
    const value = await call(harness, 'browser_status', {})
    expect(value['ownedSessions']).toBe(0)
    expect(value['otherSessions']).toBe(1)
  })

  it('写操作缺少 tabId 时给出可执行提示', async () => {
    const harness = makeHarness({ requireApprovalForBorrow: false })
    await expect(call(harness, 'browser_tabs', { action: 'close' })).rejects.toThrow(/需要 tabId/)
  })
})

describe('会话恢复', () => {
  it('会话被外部结束时丢弃记录并提示重建', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    harness.runner.responder = args => (args[0] === 'browsers'
      ? defaultOutcome(args)
      : failure('not_found', 'session not registered or already stopped', 1))
    await expect(call(harness, 'browser_observe', {})).rejects.toThrow(/已重置/)
    expect(harness.store.get('sess-1')).toBeUndefined()
  })

  it('下一次调用自动新建会话', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    harness.runner.responder = args => (args[0] === 'browsers'
      ? defaultOutcome(args)
      : failure('not_found', 'session not registered or already stopped', 1))
    await expect(call(harness, 'browser_observe', {})).rejects.toThrow()
    harness.runner.responder = defaultOutcome
    await call(harness, 'browser_observe', {})
    const starts = harness.runner.commands.filter(command => command.args[0] === 'session' && command.args[1] === 'start')
    expect(starts.length).toBe(2)
  })

  it('引用失效不会被误判成会话失效', async () => {
    const harness = makeHarness()
    const realSnapshotFailure = failure('not_found', 'ref @e9 unknown for tab 7 in session aaaa', 1)
    harness.runner.responder = args => (args[0] === 'click' ? realSnapshotFailure : defaultOutcome(args))
    await expect(call(harness, 'browser_click', { target: '@e9' })).rejects.toThrow(/ref @e9/)
    expect(harness.store.get('sess-1')).toBeDefined()
  })
})

describe('脚本闸门', () => {
  it('evaluate 默认被拒', async () => {
    const harness = makeHarness()
    await expect(call(harness, 'browser_evaluate', { expression: '1+1' })).rejects.toThrow(/默认关闭/)
  })

  it('evaluate 开启后执行并返回结果', async () => {
    const harness = makeHarness({ allowEvaluate: true })
    harness.runner.responder = args => (args[0] === 'evaluate'
      ? { stdout: '', stderr: '', exitCode: 0, json: { ok: true, tab_id: 7, value: 'https://example.com/' } }
      : defaultOutcome(args))
    const value = await call(harness, 'browser_evaluate', { expression: 'location.href' })
    expect(value['value']).toContain('example.com')
  })

  it('凭据面即使开启脚本也被拒', async () => {
    const harness = makeHarness({ allowEvaluate: true })
    harness.runner.responder = args => (args[0] === 'navigate'
      ? { stdout: '', stderr: '', exitCode: 0, json: { session_id: 'aaaa', final_url: 'https://login.example.com/' } }
      : defaultOutcome(args))
    await call(harness, 'browser_open', { url: 'https://login.example.com' })
    await expect(call(harness, 'browser_evaluate', { expression: '1' })).rejects.toThrow(/凭据面/)
  })
})

describe('借用标签页的审批闸门', () => {
  it('未挂载审批服务时拒绝借用', async () => {
    const harness = makeHarness()
    await expect(call(harness, 'browser_tabs', { action: 'borrow', tabId: '42' }))
      .rejects.toThrow(/未挂载审批服务/)
  })

  it('用户拒绝时不执行借用', async () => {
    const harness = makeHarness({ approval: 'rejected' })
    await expect(call(harness, 'browser_tabs', { action: 'borrow', tabId: '42' }))
      .rejects.toThrow(/未批准/)
    expect(harness.runner.commands.some(command => command.args[0] === 'tab')).toBe(false)
  })

  it('获批后执行借用并回列表', async () => {
    const harness = makeHarness({ approval: 'allowed-once' })
    const value = await call(harness, 'browser_tabs', { action: 'borrow', tabId: '42' })
    expect(String(value['message'])).toContain('borrow')
    const borrow = harness.runner.commands.find(command => command.args[0] === 'tab' && command.args[1] === 'borrow')
    expect(borrow?.args).toContain('42')
  })

  it('显式关闭审批要求后可直接借用', async () => {
    const harness = makeHarness({ requireApprovalForBorrow: false })
    const value = await call(harness, 'browser_tabs', { action: 'borrow', tabId: '42' })
    expect(String(value['message'])).toContain('borrow')
  })
})
