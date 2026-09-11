// @vitest-environment jsdom
/**
 * External-link outlet spec: 桌面壳把 http(s) 外链点击交给壳的 open_external
 * 命令；浏览器标签页（无 Tauri 全局对象）完全不安装监听。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installExternalLinkHandler } from '../src/client/desktop/external-links.ts'

/** 壳注入的 withGlobalTauri 面（core.invoke 记录调用）。 */
function installTauriCore(): { invoke: ReturnType<typeof vi.fn> } {
  const invoke = vi.fn(async () => undefined)
  ;(window as unknown as { __TAURI__: { core: { invoke: typeof invoke } } }).__TAURI__ = { core: { invoke } }
  return { invoke }
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

/** 安装拦截并登记清理。 */
function install(): { invoke: ReturnType<typeof vi.fn> } {
  const core = installTauriCore()
  const dispose = installExternalLinkHandler()
  expect(dispose).toBeTypeOf('function')
  disposers.push(dispose as () => void)
  return core
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  for (const child of [...document.body.children]) child.remove()
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__
})

describe('installExternalLinkHandler', () => {
  it('does nothing outside the desktop shell', () => {
    expect(installExternalLinkHandler()).toBeUndefined()
  })

  it('hands an external link click to the shell command', () => {
    const { invoke } = install()
    const anchor = appendAnchor('https://example.com/docs', '_blank')
    // 链接标签内嵌的文本节点也要命中：点击来自内部元素。
    const label = anchor.firstChild as Text
    const event = click(label)
    expect(event.defaultPrevented).toBe(true)
    expect(invoke).toHaveBeenCalledWith('open_external', { url: 'https://example.com/docs' })
  })

  it('leaves same-origin and non-web links to the page', () => {
    const { invoke } = install()
    const sameOrigin = appendAnchor(`${window.location.origin}/settings`)
    const relative = appendAnchor('/guide')
    for (const anchor of [sameOrigin, relative]) {
      expect(click(anchor).defaultPrevented).toBe(false)
    }
    expect(invoke).not.toHaveBeenCalled()
  })

  it('keeps modifier clicks and non-anchor targets untouched', () => {
    const { invoke } = install()
    const anchor = appendAnchor('https://example.com/menu', '_blank')
    expect(click(anchor, { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(click(anchor, { button: 1 }).defaultPrevented).toBe(false)
    const plain = document.createElement('span')
    document.body.append(plain)
    expect(click(plain).defaultPrevented).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })
})
