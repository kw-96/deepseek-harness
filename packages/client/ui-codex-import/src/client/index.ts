/**
 * Codex import settings card, browser half. Registers the card into the
 * Plugins configuration tab under the `codex-import` namespace the Host
 * serves, and drives it with the codexImport Remote plus the settings scope.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { CodexImportCard } from './CodexImportCard.tsx'
import {
  CODEX_IMPORT_NS,
  CodexImportCardController,
  type CodexImportSettings,
} from './codex-import-card-controller.ts'
import { en, NS, type CodexImportKey, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Codex import card copy. */
    [NS]: CodexImportKey
  }
}

/** Required services for the slot, locale, Remote, scope, and navigation. */
export const inject = ['slots', 'locale', 'remote', 'remote.codexImport', 'settingsScope', 'uiWorkspace']

/**
 * Register the dictionaries and the `codex-import` card in the Plugins tab.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-codex-import: dictionaries')
  const t = ctx.locale.bind(NS)

  // 官方 v0.1.6-alpha.2 把插件设置条目从 `settings.plugin.item` 改为 list 槽
  // `settings.plugins.tab`（同 ui-settings-plugin-inventory 的注册形态）。
  ctx.slots.inject('settings.plugins.tab', () => {
    const controller = new CodexImportCardController(
      ctx,
      ctx.settingsScope.bind<CodexImportSettings>({ namespace: CODEX_IMPORT_NS }),
    )
    const dispose = ctx.slots.register({
      name: 'settings.plugins.tab',
      id: CODEX_IMPORT_NS,
      order: 20,
      label: () => t('title'),
      locale: NS,
      inject: () => controller.inject(),
    }, CodexImportCard)
    return () => {
      dispose()
      controller.dispose()
    }
  })
}
