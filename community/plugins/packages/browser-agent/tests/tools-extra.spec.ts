/** 工具层测试（控制/安全 + P2 进阶）：状态、求助、脚本闸门、借用审批、悬停/等待/诊断/模拟/传输。 */

import { describe, expect, it } from 'vitest'
import { defaultOutcome, failure } from './support/fake-runner.js'
import { call, expectDeclaredKeys, makeHarness } from './support/harness.js'

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

  it('会话失效时自动重建并回到原页面', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    // 只有快照那一步失败：模拟 daemon 重启后会话注册表丢失。
    harness.runner.responder = (args) => {
      if (args[0] === 'snapshot') return failure('not_found', 'session not registered or already stopped', 1)
      return defaultOutcome(args)
    }
    await expect(call(harness, 'browser_observe', {})).rejects.toThrow(/已自动重建会话并回到/)
    const starts = harness.runner.commands.filter(command => command.args[0] === 'session' && command.args[1] === 'start')
    expect(starts).toHaveLength(2)   // 1 次来自 browser_open，1 次来自失效调用里的自动重建
    const navigate = harness.runner.commands.filter(command => command.args[0] === 'navigate')
    expect(navigate.at(-1)?.args.some(arg => arg.includes('example.com'))).toBe(true)
    expect(harness.store.get('sess-1')?.currentUrl).toContain('example.com')
  })

  it('重建也失败时退回旧路径，下一次调用仍能新建会话', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    harness.runner.responder = args => (args[0] === 'browsers'
      ? defaultOutcome(args)
      : failure('not_found', 'session not registered or already stopped', 1))
    await expect(call(harness, 'browser_observe', {})).rejects.toThrow(/已重置；请重新用 browser_open/)
    harness.runner.responder = defaultOutcome
    await call(harness, 'browser_observe', {})
    const starts = harness.runner.commands.filter(command => command.args[0] === 'session' && command.args[1] === 'start')
    // 1 次来自 browser_open；失效调用里尝试重建 1 次（navigate 也失败 → 记录被丢弃）；
    // 之后那次调用再建 1 次后成功。
    expect(starts.length).toBe(3)
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

describe('进阶工具', () => {
  it('悬停后重新快照，引用保持可用', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    harness.runner.commands.length = 0
    const value = await call(harness, 'browser_hover', { target: '@e2', settleMs: 300 })
    expect(harness.commandHeads()).toEqual(['hover', 'snapshot'])
    expect(String(value['note'])).toContain('悬停后已重新快照')
    const hover = harness.runner.commands.find(command => command.args[0] === 'hover')
    expect(hover?.args).toContain('300ms')
    expectDeclaredKeys(harness, 'browser_hover', value)
  })

  it('等待：ms 走 daemon 侧睡眠（不带 --session），state 走页面生命周期', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    harness.runner.commands.length = 0
    await call(harness, 'browser_wait', { ms: 1500 })
    const sleep = harness.runner.commands.find(command => command.args[0] === 'wait-ms')
    expect(sleep?.args).toEqual(['wait-ms', '1500ms'])
    harness.runner.commands.length = 0
    await call(harness, 'browser_wait', { state: 'networkidle' })
    const navigation = harness.runner.commands.find(command => command.args[0] === 'wait-for-navigation')
    expect(navigation?.args).toContain('networkidle')
  })

  it('等待参数必须二选一', async () => {
    const harness = makeHarness()
    await expect(call(harness, 'browser_wait', {})).rejects.toThrow(/需要 ms 或 state/)
    await expect(call(harness, 'browser_wait', { ms: 10, state: 'load' })).rejects.toThrow(/只能给一个/)
  })

  it('诊断把 console 条目压成可读文本', async () => {
    const harness = makeHarness()
    harness.runner.responder = args => (args[0] === 'console'
      ? {
        stdout: '', stderr: '', exitCode: 0,
        json: {
          tab_id: 7,
          entries: [
            { sequence: 1, kind: 'log', level: 'error', text: 'boom', truncated: false },
            { sequence: 2, kind: 'console', level: 'log', text: 'hi', line: 3, column: 9, truncated: false },
          ],
          next_since: 2,
          truncated: false,
        },
      }
      : defaultOutcome(args))
    const value = await call(harness, 'browser_inspect', { kind: 'console' })
    expect(String(value['note'])).toContain('#1 [error] boom')
    expect(String(value['note'])).toContain('#2 [log] hi (3:9)')
    expect(String(value['note'])).toContain('since=2')
  })

  it('模拟移动端会带上设备参数并重快照', async () => {
    const harness = makeHarness()
    const value = await call(harness, 'browser_emulate', { device: 'iPhone 15', touch: true })
    const emulate = harness.runner.commands.find(command => command.args[0] === 'emulate')
    expect(emulate?.args).toContain('iPhone 15')
    expect(emulate?.args).toContain('--touch')
    expect(String(value['note'])).toContain('模拟环境已应用')
  })

  it('上传把本地文件交给页面，下载捕获到指定路径', async () => {
    const harness = makeHarness()
    harness.runner.responder = args => (args[0] === 'download'
      ? { stdout: '', stderr: '', exitCode: 0, json: { path: 'C:/tmp/a.zip', byte_size: 2048 } }
      : defaultOutcome(args))
    const upload = await call(harness, 'browser_transfer', {
      action: 'upload', target: '@e5', files: ['C:/tmp/a.txt', 'C:/tmp/b.txt'],
    })
    expect(String(upload['message'])).toContain('已上传 2 个文件')
    const uploadCommand = harness.runner.commands.find(command => command.args[0] === 'upload')
    expect(uploadCommand?.args.filter(arg => arg === '--file')).toHaveLength(2)
    const download = await call(harness, 'browser_transfer', {
      action: 'download', target: '@e6', out: 'C:/tmp/a.zip',
    })
    expect(download['path']).toBe('C:/tmp/a.zip')
    expect(download['bytes']).toBe(2048)
    expect(String(download['message'])).toContain('已下载到')
  })

  it('传输参数缺失时明确报错', async () => {
    const harness = makeHarness()
    await expect(call(harness, 'browser_transfer', { action: 'upload', target: '@e1', files: [] }))
      .rejects.toThrow(/至少一个 files/)
    await expect(call(harness, 'browser_transfer', { action: 'download', target: '@e1' }))
      .rejects.toThrow(/需要 out/)
  })
})