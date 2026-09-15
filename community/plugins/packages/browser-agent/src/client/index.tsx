/**
 * dsh-browser-agent 浏览器入口：挂载 browserAgent Remote 与文案字典。
 *
 * 右侧栏「浏览器」标签（标签类型 + 面板体）已从本插件摘除：该位置改由
 * dsh-better-sidebar 的内嵌浏览器承担，同时保留 18 个模型工具不变。
 * 面板组件（BrowserBody / LiveSection）与其测试仍留在包内，需要时可重新挂载。
 */

import type { Context } from '@deepseek-ai/cordis'
import remoteContribution from 'dsh-browser-agent/remote'
import { en, zh } from './locales.js'
import type { LocaleFace, RemoteFace } from './faces.js'

/** 文案命名空间。 */
const NS = 'browserPanel'

export const inject = ['locale', 'remote']

/**
 * 挂载 Remote 与文案字典。
 * @param ctx - 客户端根上下文
 * @returns 卸载函数
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const locale = ctx.get('locale') as LocaleFace
  const remote = ctx.get('remote') as RemoteFace

  const disposeRemote = await remote.$mount(remoteContribution)
  const disposeLocale = locale.register(NS, { zh, en } as Record<string, Record<string, string>>)

  return async () => {
    disposeLocale()
    await disposeRemote()
  }
}
