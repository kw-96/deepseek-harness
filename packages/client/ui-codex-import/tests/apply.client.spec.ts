import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { apply } from '../src/client/index.ts'
import { CODEX_IMPORT_NS, type CodexImportSettings } from '../src/client/codex-import-card-controller.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { en, NS, zh } from '../src/client/locales.ts'

function makeScope(): SettingsScope<CodexImportSettings> {
  return {
    getSnapshot: () => ({ status: 'ready', value: { autoSync: true }, base: undefined, user: undefined, revision: undefined, writable: true, mode: 'host' }),
    subscribe: vi.fn(() => () => {}),
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
    mutate: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  } as unknown as SettingsScope<CodexImportSettings>
}

describe('ui-codex-import apply', () => {
  it('registers the dictionaries and the codex-import card slot', () => {
    const registerLocale = vi.fn(() => () => {})
    const register = vi.fn((options: { inject?: () => unknown }) => {
      options.inject?.()
      return () => {}
    })
    let injectedDisposer: (() => void) | undefined
    const injectSlot = vi.fn((_name: string, fn: () => (() => void) | undefined) => {
      injectedDisposer = fn()
      return () => {}
    })
    const bindScope = vi.fn(() => makeScope())
    const ctx = {
      effect: (fn: () => (() => void) | undefined) => fn(),
      locale: { register: registerLocale },
      slots: { inject: injectSlot, register },
      settingsScope: { bind: bindScope },
      remote: { codexImport: { run: vi.fn(), history: vi.fn(async () => ({ ok: true, value: { runs: [] } })) } },
      sessions: { open: vi.fn() },
    } as unknown as ClientContext

    apply(ctx)

    expect(registerLocale).toHaveBeenCalledWith(NS, { zh, en })
    expect(injectSlot).toHaveBeenCalledWith('settings.plugin.item', expect.any(Function))
    expect(bindScope).toHaveBeenCalledWith({ namespace: CODEX_IMPORT_NS })
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'settings.plugin.item', key: CODEX_IMPORT_NS, locale: NS }),
      expect.any(Function),
    )
    if (injectedDisposer === undefined) throw new Error('missing injected disposer')
    injectedDisposer()
  })
})
