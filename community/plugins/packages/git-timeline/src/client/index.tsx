/**
 * dsh-git-timeline 浏览器入口：挂载 gitTimeline Remote，并向宿主官方右栏
 * （ui-sidebar-right）注册一个页面型标签「Git 时间线」——
 * 注册表登记类型（含引导页入口胶囊），标签体挂进
 * `sidebar.right.pane.tab` 的 keyed 席位。插件不占用任何其它槽位。
 */

import type { Context } from '@deepseek-ai/cordis'
import { GitCommitHorizontal } from 'lucide-react'
import remoteContribution from 'dsh-git-timeline/remote'
import { TimelineBody, type TimelineBodyInjected } from './TimelineBody.js'
import { en, zh } from './locales.js'
import type {
  GitTimelineRemoteFace, LocaleFace, RemoteFace, RemoteResult, SlotsFace, TabRegistryFace, TFn,
} from './faces.js'

/** 文案命名空间。 */
const NS = 'gitTimeline'
/** 类型标识（同时是标签体在 keyed 席位上的 key）。 */
const ID = 'dsh-git-timeline'
/** 类型判别值：openTab 用的 kind，也是引导页胶囊要打开的页面。 */
const KIND = 'git-timeline'

export const inject = ['slots', 'locale', 'remote', 'sidebarRightTabs']

/** 引导页胶囊字形（收窄 lucide 的 size 类型以匹配引导条目契约）。 */
function TimelineGlyph({ size = 16, className }: { size?: number; className?: string }): React.ReactNode {
  return <GitCommitHorizontal size={size} className={className} />
}

/** 取 Remote 结果的值；失败转成异常。 */
function unwrap<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(`${result.error.code}: ${result.error.message}`)
}

/**
 * 挂载 Remote 并注册右栏标签类型。
 * @param ctx - 客户端根上下文。
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const slots = ctx.get('slots') as SlotsFace
  const locale = ctx.get('locale') as LocaleFace
  const remote = ctx.get('remote') as RemoteFace
  const tabs = ctx.get('sidebarRightTabs') as TabRegistryFace

  const disposeRemote = await remote.$mount(remoteContribution)
  const disposeLocale = locale.register(NS, { zh, en } as Record<string, Record<string, string>>)
  const t: TFn = locale.bind(NS)
  const git = ctx.get('remote.gitTimeline') as GitTimelineRemoteFace

  const disposeType = tabs.register({
    id: ID,
    kind: KIND,
    title: () => t('tabTitle'),
    guide: [{
      order: 20,
      title: () => t('guideTitle'),
      description: () => t('guideDescription'),
      icon: TimelineGlyph,
    }],
  })

  const disposeBody = slots.inject('sidebar.right.pane.tab', () => slots.register({
    name: 'sidebar.right.pane.tab',
    key: ID,
    locale: NS,
    inject: (): TimelineBodyInjected => ({
      log: async (cwd, path) => unwrap(await git.log(cwd, path === '' ? undefined : path, 50)),
      changed: async cwd => unwrap(await git.changed(cwd)),
    }),
  }, TimelineBody))

  return async () => {
    disposeBody()
    disposeType()
    disposeLocale()
    await disposeRemote()
  }
}
