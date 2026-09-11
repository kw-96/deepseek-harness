/**
 * dsh-git-timeline 浏览器入口：挂载 gitPanel Remote，并向宿主官方右栏
 * （ui-sidebar-right）注册一个页面型标签「Git」——完整 Git 面板：
 * 变更提交（含模型生成提交信息）、提交图与远程同步。
 */

import type { Context } from '@deepseek-ai/cordis'
import { GitBranch } from 'lucide-react'
import remoteContribution from 'dsh-git-timeline/remote'
import { GitBody, type GitBodyInjected } from './panel/GitBody.js'
import { en, zh } from './lib/locales.js'
import type {
  GitPanelApi, GitPanelRemoteFace, LocaleFace, RemoteFace, RemoteResult, SlotsFace, TabRegistryFace, TFn,
  WorkspaceChangeFace,
} from './lib/faces.js'

/** 文案命名空间。 */
const NS = 'gitPanel'
/** 类型标识（同时是标签体在 keyed 席位上的 key）。 */
const ID = 'dsh-git-timeline'
/** 类型判别值：openTab 用的 kind，也是引导页胶囊要打开的页面。 */
const KIND = 'git'

export const inject = ['slots', 'locale', 'remote', 'sidebarRightTabs']

/** 引导页胶囊字形（收窄 lucide 的 size 类型以匹配引导条目契约）。 */
function PanelGlyph({ size = 16, className }: { size?: number; className?: string }): React.ReactNode {
  return <GitBranch size={size} className={className} />
}

/** 取 Remote 结果的值；失败转成异常。 */
function unwrap<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(`${result.error.code}: ${result.error.message}`)
}

/** 面板消费的 Remote 面：统一解包结果。 */
function panelApi(git: GitPanelRemoteFace): GitPanelApi {
  return {
    status: async cwd => unwrap(await git.status(cwd)),
    log: async (cwd, limit) => unwrap(await git.log(cwd, limit)),
    diff: async (cwd, path, staged) => unwrap(await git.diff(cwd, path, staged)),
    show: async (cwd, hash) => unwrap(await git.show(cwd, hash)),
    showFile: async (cwd, hash, path) => unwrap(await git.showFile(cwd, hash, path)),
    branches: async cwd => unwrap(await git.branches(cwd)),
    checkout: async (cwd, branch) => unwrap(await git.checkout(cwd, branch)),
    createBranch: async (cwd, name) => unwrap(await git.createBranch(cwd, name)),
    lastMessage: async cwd => unwrap(await git.lastMessage(cwd)),
    discard: async (cwd, paths) => unwrap(await git.discard(cwd, paths)),
    stage: async (cwd, paths) => unwrap(await git.stage(cwd, paths)),
    unstage: async (cwd, paths) => unwrap(await git.unstage(cwd, paths)),
    stageAll: async cwd => unwrap(await git.stageAll(cwd)),
    unstageAll: async cwd => unwrap(await git.unstageAll(cwd)),
    commit: async (cwd, message, amend) => unwrap(await git.commit(cwd, message, amend)),
    push: async cwd => unwrap(await git.push(cwd)),
    pull: async cwd => unwrap(await git.pull(cwd)),
    fetch: async cwd => unwrap(await git.fetch(cwd)),
    identity: async cwd => unwrap(await git.identity(cwd)),
    message: async (sessionId, cwd) => unwrap(await git.message(sessionId, cwd)),
  }
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
  const api = panelApi(ctx.get('remote.gitPanel') as GitPanelRemoteFace)
  const filesFace = ctx.get('remote.workspaceFiles') as WorkspaceChangeFace | undefined

  const disposeType = tabs.register({
    id: ID,
    kind: KIND,
    title: () => t('tabTitle'),
    guide: [{
      order: 20,
      title: () => t('guideTitle'),
      description: () => t('guideDescription'),
      icon: PanelGlyph,
    }],
  })

  const disposeBody = slots.inject('sidebar.right.pane.tab', () => slots.register({
    name: 'sidebar.right.pane.tab',
    key: ID,
    locale: NS,
    // 会话文件变更流是可选面：宿主没挂载 workspaceFiles 时，面板只是不自动刷新。
    inject: (): GitBodyInjected => (filesFace === undefined ? { api } : { api, files: filesFace }),
  }, GitBody))

  return async () => {
    disposeBody()
    disposeType()
    disposeLocale()
    await disposeRemote()
  }
}
