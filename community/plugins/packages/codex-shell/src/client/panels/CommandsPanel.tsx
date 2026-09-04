/** Command-history tab: the session's user prompts, newest first. */

import { useEffect, useState } from 'react'
import { Copy, Terminal } from 'lucide-react'
import type { SessionId, TFn } from '../faces.js'
import type { CommandPrompt } from '../RightPanel.js'
import css from '../styles.module.css'

interface CommandsPanelProps {
  history: (sessionId: SessionId) => Promise<readonly CommandPrompt[]>
  sessionId?: SessionId | undefined
  t: TFn
}

export function CommandsPanel({ history, sessionId, t }: CommandsPanelProps) {
  const [items, setItems] = useState<readonly CommandPrompt[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId === undefined) return
    let cancelled = false
    history(sessionId)
      .then(value => { if (!cancelled) setItems(value) })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { cancelled = true }
  }, [history, sessionId])

  const copy = async (text: string): Promise<void> => {
    try { await navigator.clipboard.writeText(text) } catch { /* clipboard unavailable */ }
  }

  return (
    <>
      <div className={css.groupHead} style={{ margin: 8 }}>{t('commandsTitle')}</div>
      {error !== null
        ? <div className={css.error}>{error}</div>
        : items.length === 0
          ? (
            <div className={css.emptyWrap}>
              <Terminal size={20} />
              <span className={css.emptyTitle}>{t('commandsEmpty')}</span>
            </div>
          )
          : (
            <div className={css.scroll}>
              {items.map(item => (
                <div key={item.seq} className={css.card}>
                  <div className={css.cardTitle}>
                    <Terminal size={12} style={{ opacity: 0.7 }} />
                    <span style={{ opacity: 0.6 }}>#{item.seq}</span>
                    <button type="button" className={css.iconButton} style={{ marginLeft: 'auto' }}
                      title={t('commandsCopy')} onClick={() => { void copy(item.text) }}>
                      <Copy size={12} />
                    </button>
                  </div>
                  <div className={css.cardText}>{item.text}</div>
                </div>
              ))}
            </div>
          )}
    </>
  )
}
