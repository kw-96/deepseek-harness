/** Cursor-style tab strip with shell new menu. */

import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { TFn } from '../faces.js'
import css from '../styles.module.css'
import type { BottomTab, ShellDialect } from './useBottomTerminals.js'
import { defaultShellDialect } from './useBottomTerminals.js'

interface BottomTabStripProps {
  tabs: readonly BottomTab[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCreate: (dialect: ShellDialect) => void
  t: TFn
}

/** 底栏 tab 条：切换、关闭、按方言新建。 */
export function BottomTabStrip({
  tabs, activeId, onSelect, onClose, onCreate, t,
}: BottomTabStripProps): React.ReactNode {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const preferred = defaultShellDialect()

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (event: MouseEvent): void => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => { document.removeEventListener('mousedown', onDoc) }
  }, [menuOpen])

  const dialects: ShellDialect[] = preferred === 'pwsh' ? ['pwsh', 'bash'] : ['bash', 'pwsh']

  return <div className={css.bottomTabStrip}>
    <div className={css.bottomTabList} role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.terminalId}
          type="button"
          role="tab"
          aria-selected={tab.terminalId === activeId}
          className={tab.terminalId === activeId ? css.bottomTabActive : css.bottomTab}
          onClick={() => { onSelect(tab.terminalId) }}
        >
          <span className={css.bottomTabLabel}>
            {tab.title}
            {tab.origin === 'agent' && <span className={css.bottomTabBadge}>{t('bottomTerminalAgent')}</span>}
          </span>
          <span
            className={css.bottomTabClose}
            role="presentation"
            onClick={event => {
              event.stopPropagation()
              onClose(tab.terminalId)
            }}
            title={t('bottomTerminalCloseTab')}
          ><X size={12} /></span>
        </button>
      ))}
    </div>
    <div className={css.bottomTabActions} ref={menuRef}>
      <button
        type="button"
        className={css.iconButton}
        title={t('bottomTerminalNew')}
        aria-expanded={menuOpen}
        onClick={() => { setMenuOpen(open => !open) }}
      ><Plus size={14} /></button>
      {menuOpen && <div className={css.bottomTabMenu} role="menu">
        {dialects.map(dialect => (
          <button
            key={dialect}
            type="button"
            role="menuitem"
            className={css.bottomTabMenuItem}
            onClick={() => {
              setMenuOpen(false)
              onCreate(dialect)
            }}
          >{dialect === 'pwsh' ? t('bottomTerminalPwsh') : t('bottomTerminalBash')}</button>
        ))}
      </div>}
    </div>
  </div>
}
