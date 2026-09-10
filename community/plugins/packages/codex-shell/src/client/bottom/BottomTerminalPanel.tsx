/** Multi-tab interactive bottom terminal workbench. */

import { useState } from 'react'
import { Terminal, X } from 'lucide-react'
import type { TerminalApi } from './terminal-api.js'
import type { SelectorHook, SessionListStateLike, TFn } from '../faces.js'
import css from '../styles.module.css'
import { BottomTabStrip } from './BottomTabStrip.js'
import { BottomXtermView } from './BottomXtermView.js'
import { useBottomTerminals } from './useBottomTerminals.js'

interface BottomTerminalPanelProps {
  api: TerminalApi
  useSessions: SelectorHook<SessionListStateLike>
  close: () => void
  t: TFn
}

/** 当前会话的多 tab 交互式底栏终端面板。 */
export function BottomTerminalPanel({
  api, useSessions, close, t,
}: BottomTerminalPanelProps): React.ReactNode {
  const sessionId = useSessions(state => state.current)
  const cwd = useSessions(state => (
    state.current === undefined ? undefined : state.byId[state.current]?.cwd
  ))
  const {
    tabs, activeId, error, setActiveId, createTab, closeTab, clearError,
  } = useBottomTerminals(api, sessionId, cwd, t)
  const [busy, setBusy] = useState<string | null>(null)

  return <section className={css.bottomTerminal}>
    <header className={css.bottomTerminalHead}>
      <span className={css.bottomTerminalTitle}>
        <Terminal size={14} />{t('bottomTerminal')}
      </span>
      {cwd !== undefined && <span className={css.bottomTerminalCwd}>{cwd}</span>}
      <button type="button" className={css.iconButton} title={t('bottomTerminalClose')}
        onClick={() => { close() }}><X size={14} /></button>
    </header>
    {sessionId === undefined && <div className={css.error}>{t('bottomTerminalNeedAgent')}</div>}
    {error !== null && <div className={css.error} onClick={clearError}>{error}</div>}
    {busy !== null && <div className={css.error} onClick={() => { setBusy(null) }}>{busy}</div>}
    {sessionId !== undefined && <>
      <BottomTabStrip
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={id => { void closeTab(id) }}
        onCreate={dialect => { void createTab(dialect) }}
        t={t}
      />
      {tabs.length === 0
        ? <div className={css.bottomTerminalEmpty}>{t('bottomTerminalEmpty')}</div>
        : <div className={css.bottomTerminalStack}>
          {tabs.map(tab => (
            <BottomXtermView
              key={tab.terminalId}
              api={api}
              sessionId={sessionId}
              tab={tab}
              active={tab.terminalId === activeId}
              t={t}
              onBusy={setBusy}
            />
          ))}
        </div>}
    </>}
  </section>
}
