// @vitest-environment jsdom
/**
 * External-link outlet spec: 桌面壳把 http(s) 外链点击交给壳的 open_external
 * 命令（全局 API 面或 IPC 原语面）；两条 IPC 面都不可用时退回同窗口导航，
 * 由壳的导航钩子接管；浏览器标签页（无 Tauri 全局对象）完全不安装监听。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installExternalLinkHandler } from '../src/client/desktop/external-links.ts'

/** 壳可注入的两条 IPC 面。 */
type ShellGlobals = {
  __TAURI__?: { core?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> } }
  __TAURI_INTERNALS__?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> }
}

/** 页面里挂一个链接并返回它。 */
function appendAnchor(href: string, target?: string): HTMLAnchorElement {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.textContent = href
  if (target !== undefined) anchor.target = target
  document.body.append(anchor)
  return anchor
}

function click(target: EventTarget, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
  target.dispatchEvent(event)
  return event
}

const disposers: Array<() => void> = []

/** 写入壳全局对象并安装拦截，登记清理。 */
function install(globals: ShellGlobals): void {
  Object.assign(window, globals)
  const dispose = installExternalLinkHandler()
  expect(dispose).toBeTypeOf('function')
  disposers.push(dispose as () => void)
}

/** 把同窗口导航替换成可断言的 spy：jsdom 不实现真实导航。 */
function spyNavigation(): ReturnType<typeof vi.fn> {
  return vi.spyOn(window, 'open').mockImplementation(() => null) as unknown as ReturnType<typeof vi.fn>
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  for (const child of [...document.body.children]) child.remove()
  delete (window as ShellGlobals).__TAURI__
  delete (window as ShellGlobals).__TAURI_INTERNALS__
  vi.restoreAllMocks()
})

describe('installExternalLinkHandler', () => {
  it('does nothing outside the desktop shell', () => {
    expect(installExternalLinkHandler()).toBeUndefined()
  })

  it('hands an external link click to the shell command through the global API face', () => {
    const invoke = vi.fn(async () => undefined)
    install({ __TAURI__: { core: { invoke } } })
    const anchor = appendAnchor('https://example.com/docs', '_blank')
    // 链接标签内嵌的文本节点也要命中：点击来自内部元素。
    const label = anchor.firstChild as Text
    const event = click(label)
    expect(event.defaultPrevented).toBe(true)
    expect(invoke).toHaveBeenCalledWith('open_external', { url: 'https://example.com/docs' })
  })

  it('falls back to the IPC primitive face when the global API holds no core', () => {
    const invoke = vi.fn(async () => undefined)
    // 远程页面只注入 IPC 原语时 `__TAURI__.core` 缺失，不能因此静默失效。
    install({ __TAURI__: {}, __TAURI_INTERNALS__: { invoke } })
    const anchor = appendAnchor('https://example.com/primitive', '_blank')
    expect(click(anchor).defaultPrevented).toBe(true)
    expect(invoke).toHaveBeenCalledWith('open_external', { url: 'https://example.com/primitive' })
  })

  it('navigates in the same window when no IPC face exists', () => {
    const navigate = spyNavigation()
    install({ __TAURI_INTERNALS__: {} })
    const anchor = appendAnchor('https://example.com/no-ipc', '_blank')
    expect(click(anchor).defaultPrevented).toBe(true)
    expect(navigate).toHaveBeenCalledWith('https://example.com/no-ipc', '_self')
  })

  it('navigates in the same window when the shell rejects the command', async () => {
    const navigate = spyNavigation()
    const invoke = vi.fn(async () => { throw new Error('denied') })
    install({ __TAURI__: { core: { invoke } } })
    const anchor = appendAnchor('https://example.com/denied', '_blank')
    expect(click(anchor).defaultPrevented).toBe(true)
    await Promise.resolve()
    expect(navigate).toHaveBeenCalledWith('https://example.com/denied', '_self')
  })

  it('leaves same-origin and non-web links to the page', () => {
    const invoke = vi.fn(async () => undefined)
    install({ __TAURI__: { core: { invoke } } })
    const sameOrigin = appendAnchor(`${window.location.origin}/settings`)
    const relative = appendAnchor('/guide')
    for (const anchor of [sameOrigin, relative]) {
      expect(click(anchor).defaultPrevented).toBe(false)
    }
    expect(invoke).not.toHaveBeenCalled()
  })

  it('keeps modifier clicks and non-anchor targets untouched', () => {
    const invoke = vi.fn(async () => undefined)
    install({ __TAURI__: { core: { invoke } } })
    const anchor = appendAnchor('https://example.com/menu', '_blank')
    expect(click(anchor, { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(click(anchor, { button: 1 }).defaultPrevented).toBe(false)
    const plain = document.createElement('span')
    document.body.append(plain)
    expect(click(plain).defaultPrevented).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })
})
