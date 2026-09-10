/** Embedded browser tab: URL bar + same-frame iframe. */

import { useState } from 'react'
import { Globe } from 'lucide-react'
import type { TFn } from '../faces.js'
import css from '../styles.module.css'

interface BrowserPanelProps {
  t: TFn
}

export function BrowserPanel({ t }: BrowserPanelProps) {
  const [draft, setDraft] = useState('https://github.com')
  const [url, setUrl] = useState('https://github.com')

  const open = (): void => {
    let candidate = draft.trim()
    if (candidate === '') return
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`
    setUrl(candidate)
    setDraft(candidate)
  }

  return (
    <>
      <div className={css.inputRow}>
        <Globe size={14} style={{ flex: 'none', alignSelf: 'center', opacity: 0.6 }} />
        <input className={css.textInput} placeholder={t('browserUrlPlaceholder')} value={draft}
          onChange={event => { setDraft(event.target.value) }}
          onKeyDown={event => { if (event.key === 'Enter') open() }} />
        <button type="button" className={css.primaryButton} onClick={open}>{t('browserOpen')}</button>
      </div>
      <iframe className={css.iframe} src={url} title={t('browserTitle')} sandbox="allow-scripts allow-same-origin allow-popups" />
    </>
  )
}
