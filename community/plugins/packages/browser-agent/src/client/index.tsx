/**
 * dsh-browser-agent 浏览器入口：挂载 browserAgent Remote，并向宿主官方右栏
 * （ui-sidebar-right）注册一个页面型标签「浏览器」。
 */

import type { Context } from '@deepseek-ai/cordis'
import { Globe } from 'lucide-react'
import remoteContribution from 'dsh-browser-agent/remote'
import { BrowserBody, type BrowserBodyInjected } from './BrowserBody.js'
import { en, zh } from './locales.js'
import type {
  BrowserAgentRemoteFace, BrowserPanelApi, LocaleFace, RemoteFace, RemoteResult, SlotsFace, TabRegistryFace, TFn,
} from './faces.js'

/** 文案命名空间。 */
const NS = 'browserPanel'
/** 类型标识（同时是标签体在 keyed 席位上的 key）。 */
const ID = 'dsh-browser-agent'
/** 类型判别值。 */
const KIND = 'browser'

export const inject = ['slots', 'locale', 'remote', 'sidebarRightTabs']

/** 引导页胶囊字形。 */
function PanelGlyph({ size = 16, className }: { size?: number; className?: string }): React.ReactNode {
  return <Globe size={size} className={className} />
}

/** 取 Remote 结果的值；失败转成异常。 */
function unwrap<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(`${result.error.code}: ${result.error.message}`)
}

/** 面板消费的 Remote 面：统一解包结果。 */
function panelApi(remote: BrowserAgentRemoteFace): BrowserPanelApi {
  return {
    panel: async sessionId => unwrap(await remote.panel(sessionId)),
    stop: async sessionId => unwrap(await remote.stop(sessionId)),
    preview: async sessionId => unwrap(await remote.preview(sessionId)),
    live: async sessionId => unwrap(await remote.live(sessionId)),
    interrupt: async sessionId => unwrap(await remote.interrupt(sessionId)),
  }
}

/**
 * 挂载 Remote 并注册右栏标签类型。
 * @param ctx - 客户端根上下文
 * @returns 卸载函数
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const slots = ctx.get('slots') as SlotsFace
  const locale = ctx.get('locale') as LocaleFace
  const remote = ctx.get('remote') as RemoteFace
  const tabs = ctx.get('sidebarRightTabs') as TabRegistryFace

  const disposeRemote = await remote.$mount(remoteContribution)
  const disposeLocale = locale.register(NS, { zh, en } as Record<string, Record<string, string>>)
  const t: TFn = locale.bind(NS)
  const api = panelApi(ctx.get('remote.browserAgent') as BrowserAgentRemoteFace)

  const disposeType = tabs.register({
    id: ID,
    kind: KIND,
    title: () => t('tabTitle'),
    guide: [{
      order: 30,
      title: () => t('guideTitle'),
      description: () => t('guideDescription'),
      icon: PanelGlyph,
    }],
  })

  const disposeBody = slots.inject('sidebar.right.pane.tab', () => slots.register({
    name: 'sidebar.right.pane.tab',
    key: ID,
    locale: NS,
    inject: (): BrowserBodyInjected => ({ api, t }),
  }, BrowserBody))

  return async () => {
    disposeBody()
    disposeType()
    disposeLocale()
    await disposeRemote()
  }
}
