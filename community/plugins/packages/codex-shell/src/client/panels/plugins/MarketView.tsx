/**
 * 插件市场视图：搜索 + 按功能分类分组的清单 + 点选条目的独立详情区。
 * 安装采用两步确认（点安装 → 点确认），避免在窄面板内误触第三方代码。
 */
import { useMemo, useState } from 'react'
import { Download, ExternalLink, Search, X } from 'lucide-react'
import type { MarketEntryLike } from '../../RightPanel.js'
import type { TFn } from '../../faces.js'
import { groupMarketEntries, marketCategoryLabel } from './market-category.js'
import css from '../../styles.module.css'

interface MarketViewProps {
  entries: readonly MarketEntryLike[] | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onInstall: (entry: MarketEntryLike) => void
  busyId: string | null
  t: TFn
  locale: string
}

/** 条目本地化名称（按当前界面语言）。 */
function displayName(entry: MarketEntryLike, locale: string): string {
  return entry.displayName[locale === 'zh-CN' ? 'zh-CN' : 'en']
}

function summary(entry: MarketEntryLike, locale: string): string {
  return entry.summary[locale === 'zh-CN' ? 'zh-CN' : 'en']
}

export function MarketView({ entries, selectedId, onSelect, onInstall, busyId, t, locale }: MarketViewProps) {
  const [query, setQuery] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const visible = useMemo(() => {
    if (entries === null) return null
    const normalized = query.trim().toLocaleLowerCase()
    if (normalized === '') return groupMarketEntries(entries)
    const filtered = entries.filter(entry =>
      displayName(entry, locale).toLocaleLowerCase().includes(normalized)
      || (entry.packageName ?? '').toLocaleLowerCase().includes(normalized))
    return groupMarketEntries(filtered)
  }, [entries, query, locale])

  const selected = entries?.find(entry => entry.id === selectedId) ?? null
  const installing = busyId !== null && selected !== null && busyId === selected.id

  return (
    <>
      <div className={css.inputRow} style={{ borderTop: 'none', borderBottom: '0.5px solid var(--cx-line)' }}>
        <Search size={13} style={{ opacity: 0.55, flex: 'none' }} aria-hidden="true" />
        <input type="search" className={css.textInput} value={query}
          placeholder={t('pluginSearchPlaceholder')}
          onChange={event => { setQuery(event.currentTarget.value) }} />
      </div>
      <div className={css.pluginList} role="list" aria-label={t('pluginMarket')}>
        {visible === null ? <div className={css.empty}>{t('pluginLoading')}</div> : null}
        {visible !== null && visible.length === 0
          ? <div className={css.empty}>{query.trim() === '' ? t('pluginMarketEmpty') : t('pluginMarketEmptySearch')}</div>
          : null}
        {visible?.map(group => (
          <section key={group.category} role="group" aria-label={marketCategoryLabel(group.category, locale)}>
            <div className={css.pluginCategoryHead}>
              <span>{marketCategoryLabel(group.category, locale)}</span>
              <small>{group.entries.length}</small>
            </div>
            {group.entries.map(entry => (
              <button key={entry.id} type="button" role="listitem"
                aria-label={`${displayName(entry, locale)} ${entry.packageName ?? entry.id}`}
                className={entry.id === selectedId ? css.pluginListRowActive : css.pluginListRow}
                onClick={() => { setConfirmingId(null); onSelect(entry.id === selectedId ? null : entry.id) }}>
                <span className={css.pluginRowMain}>
                  <strong>{displayName(entry, locale)}</strong>
                  <code>{entry.packageName ?? entry.id}</code>
                </span>
                <span className={css.pluginRowMeta}>
                  {entry.installedVersion !== null && <small data-kind="installed">{t('pluginInstalled')}</small>}
                  <small>{entry.version ?? t('pluginUnknown')}</small>
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
      {selected !== null && (
        <div className={css.pluginDetailBackdrop} role="presentation"
          onMouseDown={event => { if (event.target === event.currentTarget) { onSelect(null); setConfirmingId(null) } }}>
          <aside className={`${css.pluginDetail} ${css.pluginDetailDialog}`} role="dialog" aria-modal="true"
            aria-label={t('pluginDetailTitle')}>
            <header className={css.pluginDetailHeader}>
              <span className={css.pluginDetailTitle}>{displayName(selected, locale)}</span>
              <button type="button" className={css.iconButton} aria-label={t('pluginDetailClose')}
                onClick={() => { onSelect(null); setConfirmingId(null) }}>
                <X size={13} />
              </button>
            </header>
            <div className={css.pluginDetailBody}>
              <p className={css.pluginDetailSummary}>{summary(selected, locale)}</p>
              <dl className={css.pluginFacts}>
                <div><dt>{t('pluginDetailPackage')}</dt><dd><code>{selected.packageName ?? t('pluginUnknown')}</code></dd></div>
                <div><dt>{t('pluginDetailVersion')}</dt><dd>{selected.version ?? t('pluginUnknown')}</dd></div>
                <div><dt>{t('pluginDetailCategory')}</dt><dd>{marketCategoryLabel(selected.category, locale)}</dd></div>
                <div><dt>{t('pluginDetailLicense')}</dt><dd>{selected.license ?? t('pluginUnknown')}</dd></div>
                <div><dt>{t('pluginDetailState')}</dt><dd>{selected.installedVersion !== null ? t('pluginInstalled') : t('pluginNotInstalled')}</dd></div>
              </dl>
              <div className={css.pluginDetailActions}>
                {selected.installedVersion !== null ? (
                  <span className={css.pluginDetailHint}>{t('pluginAlreadyInstalled')}</span>
                ) : confirmingId === selected.id ? (
                  <>
                    <span className={css.pluginDetailHint}>{t('pluginInstallConfirm')}</span>
                    <button type="button" className={css.pluginSecondaryButton}
                      disabled={installing} onClick={() => { setConfirmingId(null) }}>
                      {t('pluginInstallCancel')}
                    </button>
                    <button type="button" className={css.primaryButton}
                      disabled={installing} onClick={() => { setConfirmingId(null); onInstall(selected) }}>
                      <Download size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                      {t('pluginInstallConfirmGo')}
                    </button>
                  </>
                ) : (
                  <button type="button" className={css.primaryButton}
                    disabled={busyId !== null} onClick={() => { setConfirmingId(selected.id) }}>
                    <Download size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                    {t('pluginInstall')}
                  </button>
                )}
                <a className={css.pluginDetailLink} href={selected.repositoryUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {t('pluginDetailRepository')}
                </a>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
