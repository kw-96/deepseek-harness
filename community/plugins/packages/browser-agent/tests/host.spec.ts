/** Host 基础件测试：bsk 输出解析、快照处理、安全策略与会话托管。 */

import { describe, expect, it } from 'vitest'
import { BskError, parseJsonObject } from '../src/host/bsk.js'
import { parseBrowsers, parseTabs } from '../src/host/parse.js'
import { BrowserPolicy, hostOf } from '../src/host/policy.js'
import { countRefs, extractTitle, firstRef, truncateText } from '../src/host/snapshot.js'
import { BskSessionStore } from '../src/host/store.js'
import { defaultOutcome, FakeRunner, failure } from './support/fake-runner.js'

const SNAPSHOT = '@e1 RootWebArea "示例页"\n  @e2 button "提交"\n'

/** 构造一个记录日志的会话托管器。 */
function makeStore(
  runner: FakeRunner,
  idleTimeoutMs = 1000,
  snapshotMaxChars = 1000,
  browserInstance = '',
): BskSessionStore {
  return new BskSessionStore(runner, { idleTimeoutMs, snapshotMaxChars, browserInstance, log: () => {} })
}

describe('bsk 输出解析', () => {
  it('只解析对象形态的 JSON', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 })
    expect(parseJsonObject('[1,2]')).toBeUndefined()
    expect(parseJsonObject('not json')).toBeUndefined()
    expect(parseJsonObject('')).toBeUndefined()
  })

  it('投影浏览器与标签页字段', () => {
    const browsers = parseBrowsers({
      browsers: [{
        instance_id: 'i1', browser_name: 'edge', label: '本机', extension_version: '0.1.2', version_skew: true,
      }],
    })
    expect(browsers).toEqual([
      { instanceId: 'i1', browserName: 'edge', label: '本机', extensionVersion: '0.1.2', versionSkew: true },
    ])
    // `bsk browsers --json` 直接返回数组：同一函数必须同时支持两种形状。
    const fromRows = parseBrowsers(undefined, [{
      instance_id: 'i2', browser_name: 'chrome', label: 'arr', extension_version: '0.1.2', version_skew: false,
    }])
    expect(fromRows.map(browser => browser.instanceId)).toEqual(['i2'])
    const tabs = parseTabs({
      tabs: [
        { tab_id: 7, title: 'T', url: 'https://a/', scope: 'agent' },
        { tab_id: 8, title: 'U', url: 'https://b/', scope: 'user' },
        'garbage',
      ],
    })
    expect(tabs.map(tab => tab.scope)).toEqual(['agent', 'user'])
    expect(tabs[0]?.tabId).toBe('7')
    expect(parseBrowsers(undefined)).toEqual([])
    expect(parseTabs({ tabs: 'nope' })).toEqual([])
  })
})

describe('快照处理', () => {
  it('按上限截断并标记', () => {
    expect(truncateText('abcdef', 10)).toEqual({ text: 'abcdef', truncated: false })
    const cut = truncateText('abcdef', 3)
    expect(cut.truncated).toBe(true)
    expect(cut.text.startsWith('abc')).toBe(true)
    expect(cut.text).toContain('已按上限截断')
  })

  it('提取标题、首个引用与引用计数', () => {
    expect(extractTitle(SNAPSHOT)).toBe('示例页')
    expect(extractTitle('别的内容')).toBe('')
    expect(firstRef(SNAPSHOT)).toBe('@e1')
    expect(firstRef('no refs')).toBeNull()
    expect(countRefs(SNAPSHOT)).toBe(2)
  })
})

describe('安全策略', () => {
  const policy = new BrowserPolicy({
    allowEvaluate: false,
    sensitivePatterns: ['login', 'bank'],
    allowedPatterns: [],
  })

  it('识别凭据面', () => {
    expect(hostOf('https://login.example.com/x')).toBe('login.example.com')
    expect(hostOf('not a url')).toBeNull()
    expect(policy.isSensitive('https://login.example.com')).toBe(true)
    expect(policy.isSensitive('https://example.com')).toBe(false)
  })

  it('evaluate 默认关闭且在凭据面永久拒绝', () => {
    expect(() => policy.assertEvaluateAllowed('https://example.com')).toThrow(/默认关闭/)
    const open = new BrowserPolicy({ allowEvaluate: true, sensitivePatterns: ['login'], allowedPatterns: [] })
    expect(() => open.assertEvaluateAllowed('https://example.com')).not.toThrow()
    expect(() => open.assertEvaluateAllowed('https://login.example.com')).toThrow(/凭据面/)
  })

  it('白名单非空时限制导航', () => {
    const restricted = new BrowserPolicy({ allowEvaluate: false, sensitivePatterns: [], allowedPatterns: ['example.com'] })
    expect(() => restricted.assertNavigable('https://example.com/a')).not.toThrow()
    expect(() => restricted.assertNavigable('https://other.com')).toThrow(/允许列表/)
  })
})

describe('会话托管', () => {
  it('懒启动：仅首次 ensure 时启动 daemon 与会话', async () => {
    const runner = new FakeRunner()
    const store = makeStore(runner)
    const first = await store.ensure('s1')
    const again = await store.ensure('s1')
    expect(first.bskSessionId).toBe('aaaa')
    expect(again).toBe(first)
    expect(runner.daemonCalls).toBe(1)
    expect(runner.commands.filter(command => command.args[1] === 'start').length).toBe(1)
  })

  it('启动失败时不留下半个会话', async () => {
    const runner = new FakeRunner()
    runner.responder = args => (args[0] === 'session' && args[1] === 'start'
      ? failure('protocol', '扩展未连接', 2)
      : defaultOutcome(args))
    const store = makeStore(runner)
    await expect(store.ensure('s2')).rejects.toBeInstanceOf(BskError)
    expect(store.get('s2')).toBeUndefined()
  })

  it('快照写入状态并清除引用失效标记', async () => {
    const runner = new FakeRunner()
    const store = makeStore(runner, 1000, 8)
    await store.ensure('s3')
    store.markRefsStale('s3')
    const snapshot = store.recordSnapshot('s3', { text: SNAPSHOT, refCount: 0, truncated: false })
    const record = store.get('s3')
    expect(record?.refsStale).toBe(false)
    expect(record?.pageTitle).toBe('示例页')
    expect(snapshot.refCount).toBe(2)
    expect(snapshot.truncated).toBe(true)
  })

  it('空闲回收会结束超时会话', async () => {
    const runner = new FakeRunner()
    const store = makeStore(runner, 10)
    await store.ensure('s4')
    expect(await store.sweepIdle(Date.now() + 1_000)).toEqual(['s4'])
    expect(store.get('s4')).toBeUndefined()
    expect(runner.commands.some(command => command.args[0] === 'session' && command.args[1] === 'stop')).toBe(true)
  })

  it('stop 幂等且 stopAll 清理全部会话', async () => {
    const runner = new FakeRunner()
    const store = makeStore(runner)
    await store.ensure('s5')
    await store.ensure('s6')
    expect(await store.stop('s5', '测试')).toBe(true)
    expect(await store.stop('s5', '测试')).toBe(false)
    await store.stopAll('测试')
    expect(store.get('s6')).toBeUndefined()
  })
})

describe('多浏览器实例选择', () => {
  it('配置指定实例时带 --browser 且不再探测', async () => {
    const runner = new FakeRunner()
    const store = makeStore(runner, 1000, 1000, 'edge-work')
    await store.ensure('m1')
    const start = runner.commands.find(command => command.args[1] === 'start')
    expect(start?.args).toContain('--browser')
    expect(start?.args).toContain('edge-work')
    expect(runner.commands.some(command => command.args[0] === 'browsers')).toBe(false)
  })

  it('未配置且无实例时给出可执行提示', async () => {
    const runner = new FakeRunner()
    runner.responder = args => (args[0] === 'browsers'
      ? { stdout: '', stderr: '', exitCode: 0, json: { browsers: [] } }
      : defaultOutcome(args))
    const store = makeStore(runner)
    await expect(store.ensure('m2')).rejects.toThrow(/未检测到已连接的浏览器/)
    expect(runner.commands.some(command => command.args[1] === 'start')).toBe(false)
  })

  it('未配置且多实例时列出候选并要求配置', async () => {
    const runner = new FakeRunner()
    runner.responder = args => (args[0] === 'browsers'
      ? {
        stdout: '',
        stderr: '',
        exitCode: 0,
        json: {
          browsers: [
            { instance_id: 'aaa', browser_name: 'edge', label: '工作', extension_version: '0.1.2', version_skew: false },
            { instance_id: 'bbb', browser_name: 'chrome', label: '', extension_version: '0.1.2', version_skew: false },
          ],
        },
      }
      : defaultOutcome(args))
    const store = makeStore(runner)
    await expect(store.ensure('m3')).rejects.toThrow(/browserInstance/)
    await expect(store.ensure('m3')).rejects.toThrow(/aaa/)
  })
})
