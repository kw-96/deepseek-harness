/**
 * 桌面壳外链出口：WebView 里点击 http(s) 外链时交给系统默认浏览器。
 *
 * 壳不会为 `target="_blank"` 创建新窗口（Tauri 默认拒绝该请求），所以这里
 * 拦下点击、调用壳的 `open_external` 命令；同窗口导航由壳的导航钩子兜底。
 * 浏览器标签页没有 Tauri 全局对象，本模块不做任何事。
 */

/** 壳注入的 Tauri core 面（withGlobalTauri）。 */
interface TauriCoreFace {
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>
}

function tauriCore(): TauriCoreFace | undefined {
  const candidate = window as Window & { __TAURI__?: { core?: TauriCoreFace } }
  return candidate.__TAURI__?.core
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
  const core = tauriCore()
  if (core === undefined) return undefined
  const onClick = (event: MouseEvent): void => {
    // 只有不改变浏览器语义的普通左键点击接管：带修饰键或已处理的点击放行。
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = anchorOf(event.target)
    if (anchor === null) return
    const href = externalHref(anchor)
    if (href === undefined) return
    event.preventDefault()
    void core.invoke('open_external', { url: href }).catch(() => {
      // 打开失败保持页面不动；导航钩子仍是同窗口路径的兜底。
    })
  }
  document.addEventListener('click', onClick, true)
  return () => { document.removeEventListener('click', onClick, true) }
}
