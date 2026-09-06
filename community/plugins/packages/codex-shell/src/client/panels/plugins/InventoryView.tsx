/**
 * 已安装插件视图：按来源分类分组的紧凑清单 + 点选条目的独立详情区。
 */
import { useMemo } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import type { InventoryEntryLike } from '../../RightPanel.js'
import type { TFn } from '../../faces.js'
import css from '../../styles.module.css'

interface InventoryViewProps {
  entries: readonly InventoryEntryLike[] | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onToggle: (entry: InventoryEntryLike) => void
  busyId: string | null
  t: TFn
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  official: 'pluginCategoryOfficial',
  'third-party': 'pluginCategoryThirdParty',
}

export function InventoryView({ entries, selectedId, onSelect, onToggle, busyId, t }: InventoryViewProps) {
  const grouped = useMemo(() => {
    if (entries === null) return []
    const map = new Map<string, InventoryEntryLike[]>()
    for (const entry of entries) {
      const list = map.get(entry.category) ?? []
      list.push(entry)
      map.set(entry.category, list)
    }
    return [...map.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [entries])

  const selected = entries?.find(entry => entry.entryId === selectedId) ?? null

  return (
    <>
      <div className={css.pluginList} role="list" aria-label={t('pluginInventory')}>
        {entries === null ? <div className={css.empty}>{t('pluginLoading')}</div> : null}
        {entries !== null && entries.length === 0 ? <div className={css.empty}>{t('pluginInventoryEmpty')}</div> : null}
        {grouped.map(([category, list]) => (
          <section key={category} role="group" aria-label={t(CATEGORY_LABELS[category] ?? 'pluginCategoryOther')}>
            <div className={css.pluginCategoryHead}>
              <span>{t(CATEGORY_LABELS[category] ?? 'pluginCategoryOther')}</span>
              <small>{list.length}</small>
            </div>
            {list.map(entry => (
              <button key={entry.entryId} type="button" role="listitem"
                aria-label={`${entry.configId} ${entry.packageName}`}
                className={entry.entryId === selectedId ? css.pluginListRowActive : css.pluginListRow}
                onClick={() => { onSelect(entry.entryId === selectedId ? null : entry.entryId) }}>
                <span className={css.pluginRowMain}>
                  <strong>{entry.configId}</strong>
                  <code>{entry.packageName}</code>
                </span>
                <span className={css.pluginRowMeta}>
                  {entry.protected && <ShieldCheck size={12} aria-label={t('pluginProtected')} />}
                  <i className={css.pluginPhaseDot} data-phase={entry.enabled ? (entry.phase ?? 'running') : 'stopped'} />
                  <small>{entry.enabled ? t('pluginEnabled') : t('pluginStopped')}</small>
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
      {selected !== null && (
        <div className={css.pluginDetailBackdrop} role="presentation"
          onMouseDown={event => { if (event.target === event.currentTarget) onSelect(null) }}>
          <aside className={`${css.pluginDetail} ${css.pluginDetailDialog}`} role="dialog" aria-modal="true"
            aria-label={t('pluginDetailTitle')}>
            <header className={css.pluginDetailHeader}>
              <span className={css.pluginDetailTitle}>{selected.configId}</span>
              <button type="button" className={css.iconButton} aria-label={t('pluginDetailClose')}
                onClick={() => { onSelect(null) }}>
                <X size={13} />
              </button>
            </header>
            <div className={css.pluginDetailBody}>
              <dl className={css.pluginFacts}>
                <div><dt>{t('pluginDetailPackage')}</dt><dd><code>{selected.packageName}</code></dd></div>
                <div><dt>{t('pluginDetailEntry')}</dt><dd><code>{selected.entryId}</code></dd></div>
                <div><dt>{t('pluginDetailGroup')}</dt><dd>{selected.group}</dd></div>
                <div><dt>{t('pluginDetailCategory')}</dt><dd>{t(CATEGORY_LABELS[selected.category] ?? 'pluginCategoryOther')}</dd></div>
                <div><dt>{t('pluginDetailState')}</dt><dd>{selected.enabled ? t('pluginEnabled') : t('pluginStopped')}</dd></div>
              </dl>
              {selected.description !== null && <p className={css.pluginDetailDescription}>{selected.description}</p>}
              {selected.protected && selected.protectionReason !== null && (
                <p className={css.pluginDetailWarning}>{selected.protectionReason}</p>
              )}
              {selected.error !== null && <p className={css.pluginDetailWarning}>{selected.error}</p>}
              <div className={css.pluginDetailActions}>
                <button type="button"
                  className={selected.enabled ? css.pluginSecondaryButton : css.primaryButton}
                  disabled={selected.protected || busyId === selected.entryId}
                  onClick={() => { onToggle(selected) }}>
                  {selected.enabled ? t('pluginDisable') : t('pluginEnable')}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
