import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from 'dsh-plugin-manager/remote'
import { WorkorderCard } from './WorkorderCard.tsx'
import { WorkorderCardController } from './workorder-card-controller.ts'
import { WORKORDER_SETTINGS_NAMESPACE, type WorkorderSettings } from './workorder-card-types.ts'
import { en, zh, type WorkorderLocaleKey } from './workorder-card-locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 工单配置卡文案。 */
    workorderAgent: WorkorderLocaleKey
  }
}

/** 工单设置卡浏览器端入口。 */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginManager', 'settingsScope']

/** 将工单配置卡注册到 Harness 的“插件配置”页面。 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('workorderAgent', { zh, en }), 'workorder-agent: 设置卡文案')
  ctx.slots.inject('settings.plugin.item', () => {
    const controller = new WorkorderCardController(
      ctx.settingsScope.bind<WorkorderSettings>({ namespace: WORKORDER_SETTINGS_NAMESPACE }),
      ctx.settingsScope.describe(),
      async (input, enabled) => {
        const result = await ctx.remote.pluginManager.saveMcpServer(input, enabled)
        if (!result.ok) throw new Error(result.error.message)
        if (result.value.status === 'failed') throw new Error(result.value.message ?? 'GCP MCP 保存失败')
        return { message: result.value.message }
      },
    )
    const dispose = ctx.slots.register({
      name: 'settings.plugin.item', key: WORKORDER_SETTINGS_NAMESPACE, locale: 'workorderAgent',
      inject: () => controller.inject(),
    }, WorkorderCard)
    return () => {
      dispose()
      controller.dispose()
    }
  })
}

export { WorkorderCard } from './WorkorderCard.tsx'
export type { WorkorderCardFace, WorkorderCardState, WorkorderSettings } from './workorder-card-types.ts'
