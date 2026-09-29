import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
// 类型声明：Loader 提供 `ctx.fiber.entry` 与 `loader/volatile-update`。
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { WorkorderPluginLifecycle } from './lifecycle.js'
import { Config, readPluginConfig, type PluginConfig, type PluginConfigValues } from './pluginConfig.js'

export const name = 'workorder-agent-host'
export const inject = ['webServer', 'agents', 'skills']
export { Config }

/**
 * 挂载工单 Host：配置走本插件 profile 条目的 volatile 字段，关闭 enabled 时卸载运行时。
 *
 * 0.2.0 起设置服务只投影 profile 条目的 volatile 字段，插件不再注册设置分节：
 * 条目 id 由 Loader 提供（`ctx.fiber.entry`），写入走 `ctx.settings.update`。
 * @param ctx 插件上下文
 * @param config 组合层配置（volatile 引用）
 */
export async function apply(ctx: Context, config: PluginConfig): Promise<void> {
  const lifecycle = new WorkorderPluginLifecycle(ctx)
  const current = (): PluginConfigValues => readPluginConfig(config)
  ctx.inject(['settings'], (settingsCtx) => {
    const entryId = ctx.fiber.entry?.options.id
    lifecycle.writeSettings = async (patch): Promise<void> => {
      if (entryId === undefined) throw new Error('工单设置需要以 profile 条目的方式挂载')
      await settingsCtx.settings.update(entryId, patch)
      await lifecycle.apply(current())
    }
    // 设置页写入后 Loader 原地提交 volatile 字段，业务运行时据此热重载。
    settingsCtx.on('loader/volatile-update', () => {
      void lifecycle.apply(current())
    })
  })
  await lifecycle.apply(current())
  ctx.effect(() => async (): Promise<void> => {
    await lifecycle.stop()
  }, 'workorder-agent runtime')
}
