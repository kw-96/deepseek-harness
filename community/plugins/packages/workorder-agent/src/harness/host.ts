import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import { WorkorderPluginLifecycle } from './lifecycle.js'
import { Config, type PluginConfig } from './pluginConfig.js'

export const name = 'workorder-agent-host'
export const inject = ['webServer', 'agents', 'skills']
export { Config }
/** 工单插件在官方设置中的命名空间。 */
export const WORKORDER_SETTINGS_NS = 'workorder-agent'

/**
 * 挂载工单 Host：配置走设置卡片，关闭 enabled 时卸载运行时。
 * @param ctx 插件上下文
 * @param config 组合层配置
 */
export async function apply(ctx: Context, config: PluginConfig): Promise<void> {
  const lifecycle = new WorkorderPluginLifecycle(ctx)
  let source = (): PluginConfig => config
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, WORKORDER_SETTINGS_NS, Config, config, {
      setSource: (current: () => PluginConfig): void => {
        source = current
      },
      onChange: (): void => {
        void lifecycle.apply(source())
      },
    })
  })
  await lifecycle.apply(source())
  ctx.effect(() => async (): Promise<void> => {
    await lifecycle.stop()
  }, 'workorder-agent runtime')
}
