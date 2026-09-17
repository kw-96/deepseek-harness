/**
 * 桌面壳外链出口：WebView 里点击 http(s) 外链时交给系统默认浏览器。
 *
 * 壳不会为 `target="_blank"` 创建新窗口（Tauri 默认拒绝该请求），所以这里
 * 拦下点击、调用壳的 `open_external` 命令；两条 IPC 面都不可用时退回同窗口
 * 导航，由壳的导航钩子接管。浏览器标签页没有 Tauri 全局对象，本模块不做任何事。
 */
import { isDesktopShell } from './detect.ts'

/** 壳的 IPC 调用面。 */
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

/**
 * 取壳的 invoke：优先全局 API 面，退回 Tauri 的 IPC 原语面。
 *
 * 远程页面（`http://127.0.0.1:<port>`）与随包页面注入的全局对象并不相同，
 * 只认 `__TAURI__.core` 会让外链点击静默失效。
 * @returns 可用的 invoke，或两者都缺失时的 undefined。
 */
function tauriInvoke(): Invoke | undefined {
  const candidate = window as Window & {
    __TAURI__?: { core?: { invoke?: Invoke } }
    __TAURI_INTERNALS__?: { invoke?: Invoke }
  }
  const core = candidate.__TAURI__?.core
  if (typeof core?.invoke === 'function') return core.invoke.bind(core)
  const internals = candidate.__TAURI_INTERNALS__
  if (typeof internals?.invoke === 'function') return internals.invoke.bind(internals)
  return undefined
}

/** 一次点击是否落在需要交给系统浏览器打开的外链上。 */
function externalHref(anchor: Element): string | undefined {
  const href = anchor.getAttribute('href')
  if (href === null || href === '') return undefined
  let parsed: URL
  try {
    parsed = new URL(href, window.location.href)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  if (parsed.host === window.location.host) return undefined
  return parsed.href
}

/** 事件目标所属的外链元素：元素本身或文本节点的父元素。 */
function anchorOf(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target.closest('a[href]')
  if (target instanceof Node) return target.parentElement?.closest('a[href]') ?? null
  return null
}

/**
 * 安装外链点击拦截；返回卸载函数。非桌面壳环境返回 undefined。
 * @returns 移除监听器的函数，或非桌面壳下的 undefined。
 */
export function installExternalLinkHandler(): (() => void) | undefined {
  if (!isDesktopShell()) return undefined
  const invoke = tauriInvoke()
  // 没有可用 IPC 面（或命令被拒）时退回同窗口导航：壳的导航钩子对外部地址
  // 一律交给系统浏览器并拒绝在壳内导航，因此点击不会失去出口。
  const handoff = (href: string): void => { window.open(href, '_self') }
  const onClick = (event: MouseEvent): void => {
    // 只有不改变浏览器语义的普通左键点击接管：带修饰键或已处理的点击放行。
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = anchorOf(event.target)
    if (anchor === null) return
    const href = externalHref(anchor)
    if (href === undefined) return
    event.preventDefault()
    if (invoke === undefined) {
      handoff(href)
      return
    }
    void invoke('open_external', { url: href }).catch(() => { handoff(href) })
  }
  document.addEventListener('click', onClick, true)
  return () => { document.removeEventListener('click', onClick, true) }
}
