/** Pinned summary notes tab: key conclusions persisted per session. */

import { useState } from 'react'
import { Plus, Trash2, StickyNote } from 'lucide-react'
import type { SessionId, TFn } from '../faces.js'
import type { SessionMetaStore } from '../session-meta.js'
import { useSessionNotes } from '../session-meta.js'
import css from '../styles.module.css'

interface SummaryPanelProps {
  meta: SessionMetaStore
  sessionId?: SessionId | undefined
  t: TFn
}

export function SummaryPanel({ meta, sessionId, t }: SummaryPanelProps) {
  const [notes, add, remove] = useSessionNotes(meta, sessionId)
  const [draft, setDraft] = useState('')

  const submit = (): void => {
    if (draft.trim() === '') return
    add(draft)
    setDraft('')
  }

  return (
    <>
      <div className={css.inputRow}>
        <input className={css.textInput} placeholder={t('summaryPlaceholder')} value={draft}
          onChange={event => { setDraft(event.target.value) }}
          onKeyDown={event => { if (event.key === 'Enter') submit() }} />
        <button type="button" className={css.primaryButton} onClick={submit}>
          <Plus size={13} style={{ verticalAlign: -2, marginRight: 3 }} />
          {t('summaryAdd')}
        </button>
      </div>
      <div className={css.scroll}>
        {notes.length === 0
          ? (
            <div className={css.emptyWrap}>
              <StickyNote size={20} />
              <span className={css.emptyTitle}>{t('summaryEmpty')}</span>
            </div>
          )
          : notes.map(note => (
            <div key={note.id} className={css.card}>
              <div className={css.cardTitle}>
                <StickyNote size={12} style={{ opacity: 0.7 }} />
                <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.55 }}>
                  {new Date(note.at).toLocaleString()}
                </span>
                <button type="button" className={css.iconButton} title={t('summaryRemove')}
                  onClick={() => { remove(note.id) }}>
                  <Trash2 size={12} />
                </button>
              </div>
              <div className={css.cardText}>{note.text}</div>
            </div>
          ))}
      </div>
    </>
  )
}
