/**
 * 插件面板：已安装清单与插件市场两个独立视图，各自带点选详情区。
 * 数据分别来自可选的 pluginManager / marketplace remote，缺失时降级提示。
 */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { CodexMarketplace, CodexPluginManager, InventoryEntryLike, MarketEntryLike } from '../../RightPanel.js'
import type { TFn } from '../../faces.js'
import { InventoryView } from './InventoryView.js'
import { MarketView } from './MarketView.js'
import css from '../../styles.module.css'

type PluginsView = 'installed' | 'market'

export interface PluginsPanelProps {
  pluginManager: CodexPluginManager | undefined
  marketplace: CodexMarketplace | undefined
  t: TFn
  locale: string
}

interface PluginsState {
  inventory: readonly InventoryEntryLike[] | null
  marketEntries: readonly MarketEntryLike[] | null
  error: string | null
}

/** 市场条目筛选：只保留可安装且带精确包名与版本的条目。 */
function installable(entries: readonly MarketEntryLike[]): readonly MarketEntryLike[] {
  return entries.filter(entry => entry.availability === 'installable' && entry.packageName !== null && entry.version !== null)
}

export function PluginsPanel({ pluginManager, marketplace, t, locale }: PluginsPanelProps) {
  const [view, setView] = useState<PluginsView>('installed')
  const [state, setState] = useState<PluginsState>({ inventory: null, marketEntries: null, error: null })
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setBusy(true)
    const next: PluginsState = { inventory: null, marketEntries: null, error: null }
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
        if (result.ok) next.marketEntries = installable(result.value.entries)
      }
    } catch (error) {
      next.error = next.error ?? (error instanceof Error ? error.message : String(error))
    }
    setState(next)
    setBusy(false)
  }, [pluginManager, marketplace])

  useEffect(() => { void refresh() }, [refresh])

  const switchView = (next: PluginsView): void => {
    setView(next)
    setSelectedId(null)
  }

  const toggleEntry = async (entry: InventoryEntryLike): Promise<void> => {
    if (pluginManager === undefined || entry.protected) return
    setBusyId(entry.entryId)
    const result = await pluginManager.setEnabled(entry.entryId, !entry.enabled)
    setBusyId(null)
    if (result.ok) setState(prev => ({ ...prev, inventory: result.value.snapshot.entries }))
    else setState(prev => ({ ...prev, error: result.error.message }))
  }

  const install = async (entry: MarketEntryLike): Promise<void> => {
    if (marketplace === undefined || entry.packageName === null || entry.version === null) return
    setBusyId(entry.id)
    setNotice(null)
    const result = await marketplace.installPlugin(entry.packageName, entry.version)
    setBusyId(null)
    if (result.ok) {
      const message = (result.value as { message?: unknown } | undefined)?.message
      if (typeof message === 'string' && message.trim() !== '') setNotice(message)
      void refresh()
    } else {
      setState(prev => ({ ...prev, error: result.error.message }))
    }
  }

  if (pluginManager === undefined && marketplace === undefined) {
    return <div className={css.empty}>{t('pluginManagerMissing')}</div>
  }

  const inventoryCount = state.inventory?.length ?? 0
  const marketCount = state.marketEntries?.length ?? 0

  return (
    <>
      <div className={css.header} style={{ borderBottom: 'none' }}>
        <span className={css.title}>{t('pluginInventory')}</span>
        <button type="button" className={css.iconButton} disabled={busy}
          aria-label={t('pluginRefresh')} onClick={() => { void refresh() }}>
          <RefreshCw size={13} className={busy ? css.spin : undefined} />
        </button>
      </div>
      <div className={css.pluginTabs} role="tablist" aria-label={t('panelPlugins')}>
        <button type="button" role="tab" aria-selected={view === 'installed'}
          className={view === 'installed' ? css.pluginTabActive : css.pluginTab}
          onClick={() => { switchView('installed') }}>
          {t('pluginInventory')} <small>{inventoryCount}</small>
        </button>
        <button type="button" role="tab" aria-selected={view === 'market'}
          className={view === 'market' ? css.pluginTabActive : css.pluginTab}
          onClick={() => { switchView('market') }}>
          {t('pluginMarket')} <small>{marketCount}</small>
        </button>
      </div>
      {state.error !== null && <div className={css.error}>{state.error}</div>}
      {notice !== null && <div className={css.notice} role="status">{notice}</div>}
      <div className={css.pluginPanelRoot}>
        {view === 'installed' ? (
          <InventoryView entries={state.inventory} selectedId={selectedId} onSelect={setSelectedId}
            onToggle={(entry) => { void toggleEntry(entry) }} busyId={busyId} t={t} />
        ) : (
          <MarketView entries={state.marketEntries} selectedId={selectedId} onSelect={setSelectedId}
            onInstall={(entry) => { void install(entry) }} busyId={busyId} t={t} locale={locale} />
        )}
      </div>
    </>
  )
}
