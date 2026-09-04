/** Embedded plugin manager: runtime inventory (enable/disable) + market install. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Download, ShieldCheck } from 'lucide-react'
import type { CodexMarketplace, CodexPluginManager, InventoryEntryLike } from '../RightPanel.js'
import type { TFn } from '../faces.js'
import css from '../styles.module.css'

interface PluginsPanelProps {
  pluginManager: CodexPluginManager | undefined
  marketplace: CodexMarketplace | undefined
  t: TFn
}

interface PluginsState {
  inventory: readonly InventoryEntryLike[] | null
  marketEntries: readonly { packageName: string; version: string; name: string }[] | null
  error: string | null
  busy: boolean
}

export function PluginsPanel({ pluginManager, marketplace, t }: PluginsPanelProps) {
  const [state, setState] = useState<PluginsState>({ inventory: null, marketEntries: null, error: null, busy: false })

  const refresh = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, busy: true }))
    const next: PluginsState = { inventory: null, marketEntries: null, error: null, busy: false }
    try {
      if (pluginManager !== undefined) {
        const result = await pluginManager.list()
        if (result.ok) next.inventory = result.value.entries
      }
    } catch (error) {
      next.error = error instanceof Error ? error.message : String(error)
    }
    try {
      if (marketplace !== undefined) {
        const result = await marketplace.list(false)
        if (result.ok) {
          next.marketEntries = result.value.entries
            .filter(entry => entry.availability === 'installable' && entry.packageName !== null && entry.version !== null)
            .map(entry => ({ packageName: entry.packageName as string, version: entry.version as string, name: entry.displayName['zh-CN'] }))
        }
      }
    } catch (error) {
      next.error = next.error ?? (error instanceof Error ? error.message : String(error))
    }
    setState(next)
  }, [pluginManager, marketplace])

  useEffect(() => { void refresh() }, [refresh])

  const toggleEntry = async (entry: InventoryEntryLike): Promise<void> => {
    if (pluginManager === undefined || entry.protected) return
    const result = await pluginManager.setEnabled(entry.entryId, !entry.enabled)
    if (result.ok) setState(prev => ({ ...prev, inventory: result.value.snapshot.entries }))
    else setState(prev => ({ ...prev, error: result.error.message }))
  }

  const install = async (packageName: string, version: string): Promise<void> => {
    if (marketplace === undefined) return
    setState(prev => ({ ...prev, busy: true }))
    const result = await marketplace.installPlugin(packageName, version)
    setState(prev => ({ ...prev, busy: false }))
    if (result.ok) void refresh()
  }

  const grouped = useMemo(() => {
    if (state.inventory === null) return []
    const map = new Map<string, InventoryEntryLike[]>()
    for (const entry of state.inventory) {
      const list = map.get(entry.category) ?? []
      list.push(entry)
      map.set(entry.category, list)
    }
    return [...map.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [state.inventory])

  if (pluginManager === undefined && marketplace === undefined) {
    return <div className={css.empty}>{t('pluginManagerMissing')}</div>
  }

  return (
    <>
      <div className={css.header} style={{ borderBottom: 'none' }}>
        <span className={css.title}>{t('pluginInventory')}{state.inventory === null ? '' : ` (${state.inventory.length})`}</span>
        <button type="button" className={css.iconButton} disabled={state.busy} onClick={() => { void refresh() }}>
          <RefreshCw size={13} className={state.busy ? css.spin : undefined} />
        </button>
      </div>
      {state.error !== null && <div className={css.error}>{state.error}</div>}
      <div className={css.scroll}>
        {grouped.map(([category, entries]) => (
          <div key={category} className={css.group}>
            <div className={css.groupHead}>{category} ({entries.length})</div>
            {entries.map(entry => (
              <div key={entry.entryId} className={css.fileRow} style={{ alignItems: 'flex-start', cursor: 'default' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {entry.entryId}
                    </span>
                    {entry.protected && <ShieldCheck size={12} style={{ flex: 'none', opacity: 0.7 }} />}
                  </div>
                  {entry.description !== null && (
                    <div style={{ fontSize: 11, opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.description}
                    </div>
                  )}
                </div>
                <button type="button" className={entry.enabled ? css.primaryButton : css.iconButtonActive}
                  style={entry.protected ? { opacity: 0.4, cursor: 'default' } : undefined}
                  disabled={entry.protected}
                  onClick={() => { void toggleEntry(entry) }}>
                  {entry.enabled ? t('pluginDisable') : t('pluginEnable')}
                </button>
              </div>
            ))}
          </div>
        ))}
        {state.marketEntries !== null && state.marketEntries.length > 0 && (
          <div className={css.group}>
            <div className={css.groupHead}>{t('pluginMarket')} ({state.marketEntries.length})</div>
            {state.marketEntries.map(entry => (
              <div key={entry.packageName} className={css.fileRow} style={{ alignItems: 'flex-start', cursor: 'default' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>{entry.packageName}@{entry.version}</div>
                </div>
                <button type="button" className={css.primaryButton} disabled={state.busy}
                  onClick={() => { void install(entry.packageName, entry.version) }}>
                  <Download size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {t('pluginInstall')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
