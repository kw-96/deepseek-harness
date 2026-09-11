/** 工具层测试（观测与交互）：注册、懒启动、快照策略、截图回退。 */

import { describe, expect, it } from 'vitest'
import { defaultOutcome, failure } from './support/fake-runner.js'
import { call, makeHarness } from './support/harness.js'

describe('工具注册', () => {
  it('注册全部浏览器工具', () => {
    const harness = makeHarness()
    expect([...harness.tools.keys()].sort()).toEqual([
      'browser_ask_human', 'browser_click', 'browser_evaluate', 'browser_fill', 'browser_history',
      'browser_observe', 'browser_open', 'browser_press', 'browser_select', 'browser_status',
      'browser_stop', 'browser_tabs',
    ])
    for (const tool of harness.tools.values()) expect(tool.output.render).toBeTypeOf('function')
  })

  it('非 Agent 调用被拒绝', async () => {
    const harness = makeHarness({ agent: false })
    await expect(call(harness, 'browser_open', { url: 'https://example.com' })).rejects.toThrow(/Agent 会话/)
  })

  it('卸载时注销全部工具', () => {
    const harness = makeHarness()
    expect(harness.tools.size).toBe(12)
    harness.dispose()
    expect(harness.tools.size).toBe(0)
  })
})

describe('观测', () => {
  it('browser_open 导航后自动快照', async () => {
    const harness = makeHarness()
    const value = await call(harness, 'browser_open', { url: 'https://example.com' })
    expect(value['url']).toBe('https://example.com')
    expect(value['title']).toBe('示例页')
    expect(value['refs']).toBe(2)
    expect(String(value['snapshot'])).toContain('@e2 button')
    expect(harness.commandHeads()).toEqual(['session', 'navigate', 'snapshot'])
  })

  it('新标签页打开后等待导航再快照', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com', newTab: true })
    expect(harness.commandHeads()).toEqual(['session', 'tab', 'wait-for-navigation', 'snapshot'])
  })

  it('browser_observe 默认快照、可切 HTML', async () => {
    const harness = makeHarness()
    const snapshot = await call(harness, 'browser_observe', {})
    expect(snapshot['mode']).toBe('snapshot')
    const html = await call(harness, 'browser_observe', { mode: 'html' })
    expect(html['content']).toContain('<html>')
  })
})

describe('交互', () => {
  it('引用新鲜时直接点击，之后重新快照', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    harness.runner.commands.length = 0
    const value = await call(harness, 'browser_click', { target: '@e2' })
    expect(harness.commandHeads()).toEqual(['click', 'snapshot'])
    expect(String(value['note'])).toContain('点击后已重新快照')
  })

  it('引用失效时先补拍快照再点击', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    harness.store.markRefsStale('sess-1')
    harness.runner.commands.length = 0
    const value = await call(harness, 'browser_click', { target: '@e2' })
    expect(harness.commandHeads()).toEqual(['snapshot', 'click', 'snapshot'])
    expect(String(value['note'])).toContain('引用已失效')
  })

  it('fill 与 select 不改动引用有效性，且参数原样传递', async () => {
    const harness = makeHarness()
    const fill = await call(harness, 'browser_fill', { target: '@e3', value: '中文值' })
    expect(fill['refsValid']).toBe(true)
    const pick = await call(harness, 'browser_select', { target: '@e4', values: ['a', 'b'] })
    expect(String(pick['message'])).toContain('a, b')
    const fillCommand = harness.runner.commands.find(command => command.args[0] === 'fill')
    expect(fillCommand?.args).toContain('中文值')
  })

  it('可能提交的按键会刷新快照，普通按键不会', async () => {
    const harness = makeHarness()
    const tab = await call(harness, 'browser_press', { key: 'Tab' })
    expect(tab['refsValid']).toBe(true)
    harness.runner.commands.length = 0
    const enter = await call(harness, 'browser_press', { key: 'Enter', target: 'e9' })
    expect(harness.commandHeads()).toEqual(['press', 'snapshot'])
    expect(String(enter['note'])).toContain('快照已刷新')
    const press = harness.runner.commands.find(command => command.args[0] === 'press')
    expect(press?.args).toContain('--ref')
  })
})

describe('截图回退', () => {
  it('整页截图失败时改用根节点引用', async () => {
    const harness = makeHarness()
    harness.runner.responder = (args) => {
      if (args[0] === 'screenshot') {
        return args.includes('--ref')
          ? { stdout: '', stderr: '', exitCode: 0, json: { path: 'C:/tmp/x.png', byte_size: 9, width: 10, height: 5 } }
          : failure('cdp_failed', 'image readback failed')
      }
      if (args[0] === 'snapshot') {
        return { stdout: '', stderr: '', exitCode: 0, json: { text: '@e1 RootWebArea "示例页"', ref_count: 1, truncated: false } }
      }
      return defaultOutcome(args)
    }
    const value = await call(harness, 'browser_observe', { mode: 'screenshot' })
    expect(value['screenshotPath']).toBe('C:/tmp/x.png')
    expect(value['screenshotSize']).toBe('10x5')
    expect(String(value['note'])).toContain('回退')
    expect(harness.store.get('sess-1')?.lastScreenshotPath).toBe('C:/tmp/x.png')
  })

  it('其它截图错误不被吞掉', async () => {
    const harness = makeHarness()
    harness.runner.responder = args => (args[0] === 'screenshot'
      ? failure('not_found', '没有可截图的标签页', 1)
      : defaultOutcome(args))
    await expect(call(harness, 'browser_observe', { mode: 'screenshot' })).rejects.toThrow(/没有可截图的标签页/)
  })
})
