/** 工具层测试（观测与交互）：注册、懒启动、快照策略、截图回退。 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultOutcome, failure } from './support/fake-runner.js'
import { call, expectDeclaredKeys, makeHarness } from './support/harness.js'

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
  it('引用新鲜时直接点击，之后重新快照并刷新 URL', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    harness.runner.commands.length = 0
    harness.runner.responder = args => (args[0] === 'tab'
      ? {
        stdout: '',
        stderr: '',
        exitCode: 0,
        json: { tabs: [{ tab_id: 9, title: '跳转后', url: 'https://post-click.example/', active: true, scope: 'agent' }] },
      }
      : defaultOutcome(args))
    const value = await call(harness, 'browser_click', { target: '@e2' })
    expect(harness.commandHeads()).toEqual(['click', 'snapshot', 'tab'])
    expect(String(value['note'])).toContain('点击后已重新快照')
    // URL 以活动标签页为准，避免出现「旧 URL + 新快照」
    expect(value['url']).toBe('https://post-click.example/')
  })

  it('引用失效时先补拍快照再点击', async () => {
    const harness = makeHarness()
    await call(harness, 'browser_open', { url: 'https://example.com' })
    harness.store.markRefsStale('sess-1')
    harness.runner.commands.length = 0
    const value = await call(harness, 'browser_click', { target: '@e2' })
    expect(harness.commandHeads()).toEqual(['snapshot', 'click', 'snapshot', 'tab'])
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

  it('dom 模式下改用 hover 取坐标再执行 element.click()', async () => {
    const harness = makeHarness({ clickMode: 'dom' })
    await call(harness, 'browser_open', { url: 'https://example.com' })
    harness.runner.commands.length = 0
    const value = await call(harness, 'browser_click', { target: '@e2' })
    expect(harness.commandHeads()).toEqual(['hover', 'evaluate', 'snapshot', 'tab'])
    expect(String(value['note'])).toContain('DOM 模式')
    const evaluate = harness.runner.commands.find(command => command.args[0] === 'evaluate')
    // 表达式里应带上 hover 返回的坐标，而不是原样透传引用
    expect(String(evaluate?.args[1])).toContain('xs=240')
    expect(String(evaluate?.args[1])).toContain('ys=192')
  })

  it('dom 模式下 hover 拿不到坐标时明确报错', async () => {
    const harness = makeHarness({ clickMode: 'dom' })
    harness.runner.responder = args => (args[0] === 'hover'
      ? { stdout: '', stderr: '', exitCode: 0, json: {} }
      : defaultOutcome(args))
    await expect(call(harness, 'browser_click', { target: '@e2' })).rejects.toThrow(/拿不到/)
  })

  it('可能提交的按键会刷新快照，普通按键不会', async () => {
    const harness = makeHarness()
    const tab = await call(harness, 'browser_press', { key: 'Tab' })
    expect(tab['refsValid']).toBe(true)
    harness.runner.commands.length = 0
    const enter = await call(harness, 'browser_press', { key: 'Enter', target: 'e9' })
    expect(harness.commandHeads()).toEqual(['press', 'snapshot', 'tab'])
    expect(String(enter['note'])).toContain('快照已刷新')
    const press = harness.runner.commands.find(command => command.args[0] === 'press')
    expect(press?.args).toContain('--ref')
  })
})

describe('截图回退', () => {
  it('整页截图失败时改用根节点引用（0.1.x 的 aria 快照）', async () => {
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

  it('整页截图瞬时失败会重试一次（0.2.1 起整页截图已可用）', async () => {
    const harness = makeHarness()
    let attempts = 0
    harness.runner.responder = (args) => {
      if (args[0] === 'screenshot') {
        attempts += 1
        return attempts === 1
          ? failure('cdp_failed', 'image readback failed')
          : { stdout: '', stderr: '', exitCode: 0, json: { path: 'C:/tmp/retry.png', byte_size: 5, width: 20, height: 10 } }
      }
      return defaultOutcome(args)
    }
    const value = await call(harness, 'browser_observe', { mode: 'screenshot' })
    expect(attempts).toBe(2)
    expect(value['screenshotPath']).toBe('C:/tmp/retry.png')
    expect(String(value['note'])).toContain('重试成功')
  })

  it('0.2.x 的 VOM 没有根节点引用，整页持续失败时如实报错', async () => {
    const harness = makeHarness()
    let attempts = 0
    harness.runner.responder = (args) => {
      if (args[0] === 'screenshot') { attempts += 1; return failure('cdp_failed', 'image readback failed') }
      if (args[0] === 'snapshot') {
        return {
          stdout: '', stderr: '', exitCode: 0,
          json: { text: '@vom 1\nL1 page\n  RootWebArea "Example Domain"\n    @e1 link "Learn more"', ref_count: 1, truncated: false },
        }
      }
      return defaultOutcome(args)
    }
    await expect(call(harness, 'browser_observe', { mode: 'screenshot' })).rejects.toThrow(/image readback failed/)
    expect(attempts).toBe(2)
  })

  it('其它截图错误不被吞掉', async () => {
    const harness = makeHarness()
    harness.runner.responder = args => (args[0] === 'screenshot'
      ? failure('not_found', '没有可截图的标签页', 1)
      : defaultOutcome(args))
    await expect(call(harness, 'browser_observe', { mode: 'screenshot' })).rejects.toThrow(/没有可截图的标签页/)
  })
})

describe('输出契约', () => {
  it('各工具返回值只含其 schema 声明的字段（注册表会拒掉多余键）', async () => {
    const harness = makeHarness()
    const open = await call(harness, 'browser_open', { url: 'https://example.com' })
    expectDeclaredKeys(harness, 'browser_open', open)
    for (const args of [{}, { mode: 'html' }, { mode: 'screenshot' }]) {
      const observed = await call(harness, 'browser_observe', args)
      expectDeclaredKeys(harness, 'browser_observe', observed)
    }
    const clicked = await call(harness, 'browser_click', { target: '@e2' })
    expectDeclaredKeys(harness, 'browser_click', clicked)
    const filled = await call(harness, 'browser_fill', { target: '@e3', value: 'x' })
    expectDeclaredKeys(harness, 'browser_fill', filled)
    const pressed = await call(harness, 'browser_press', { key: 'Tab' })
    expectDeclaredKeys(harness, 'browser_press', pressed)
    const navigated = await call(harness, 'browser_history', { action: 'reload' })
    expectDeclaredKeys(harness, 'browser_history', navigated)
    const listed = await call(harness, 'browser_tabs', { action: 'list' })
    expectDeclaredKeys(harness, 'browser_tabs', listed)
    const status = await call(harness, 'browser_status', {})
    expectDeclaredKeys(harness, 'browser_status', status)
    const stopped = await call(harness, 'browser_stop', {})
    expectDeclaredKeys(harness, 'browser_stop', stopped)
  })
})
describe('截图附件内联', () => {
  it('宿主支持时把截图提交为附件，并在渲染里内联图像块', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)])
    const file = join(tmpdir(), `bsk-shot-${String(Date.now())}.png`)
    writeFileSync(file, png)
    const harness = makeHarness({
      saveImage: async input => ({
        attachmentId: 'att-1',
        mediaType: input.mediaType as 'image/png',
        bytes: input.data.byteLength,
        width: 10,
        height: 5,
      }),
    })
    harness.runner.responder = args => (args[0] === 'screenshot'
      ? { stdout: '', stderr: '', exitCode: 0, json: { path: file, byte_size: png.length, width: 10, height: 5 } }
      : defaultOutcome(args))
    try {
      const value = await call(harness, 'browser_observe', { mode: 'screenshot' })
      expectDeclaredKeys(harness, 'browser_observe', value)
      expect(value['image']).toEqual({ attachmentId: 'att-1', mediaType: 'image/png', bytes: png.length, width: 10, height: 5 })
      const tool = harness.tools.get('browser_observe')
      const blocks = tool?.output.render({ mode: 'screenshot' } as never, value as never) as { type: string }[]
      expect(blocks.some(block => block.type === 'image')).toBe(true)
    }
    finally {
      rmSync(file, { force: true })
    }
  })

  it('宿主不支持时退回只给路径，并说明无法内联', async () => {
    const harness = makeHarness()
    const value = await call(harness, 'browser_observe', { mode: 'screenshot' })
    expect(value['image']).toBeUndefined()
    const tool = harness.tools.get('browser_observe')
    const blocks = tool?.output.render({ mode: 'screenshot' } as never, value as never) as { type: string, text?: string }[]
    expect(blocks.some(block => block.type === 'image')).toBe(false)
    expect(blocks[0]?.text ?? '').toContain('无法内联')
  })
})