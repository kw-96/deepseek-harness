/** Single-tab xterm view: follow / write / resize; stays mounted when hidden. */

import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { CodexApi } from '../RightPanel.js'
import type { TFn } from '../faces.js'
import css from '../styles.module.css'
import type { BottomTab } from './useBottomTerminals.js'

interface BottomXtermViewProps {
  api: CodexApi
  sessionId: string
  tab: BottomTab
  active: boolean
  t: TFn
  onBusy?: (message: string) => void
}

function isSendActive(reason: unknown): boolean {
  if (reason === null || typeof reason !== 'object') return false
  const code = (reason as { code?: unknown }).code
  const message = reason instanceof Error ? reason.message : String(reason)
  return code === 'SEND_ACTIVE' || /SEND_ACTIVE|active send/i.test(message)
}

/** 单个底栏 tab 的 xterm 宿主；非活跃时仍 follow，仅隐藏 DOM。 */
export function BottomXtermView({
  api, sessionId, tab, active, t, onBusy,
}: BottomXtermViewProps): React.ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const termRef = useRef<XTerm | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const term = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: { background: '#0d0d0d', foreground: '#e6e6e6', cursor: '#e6e6e6' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fitRef.current = fit
    termRef.current = term
    let cancelled = false
    const followAbort = new AbortController()
    term.writeln(t('bottomTerminalStarting'))

    const publishResize = (): void => {
      if (!activeRef.current) return
      fit.fit()
      void api.terminalResize(sessionId, tab.terminalId, term.cols, term.rows).catch(() => {})
    }

    const dataDisposable = term.onData((data) => {
      if (!activeRef.current) return
      void api.terminalWrite(sessionId, tab.terminalId, data).catch(reason => {
        if (cancelled) return
        if (isSendActive(reason)) {
          onBusy?.(t('bottomTerminalBusy'))
          return
        }
        setLocalError(reason instanceof Error ? reason.message : String(reason))
      })
    })

    void (async () => {
      try {
        const prior = await api.terminalRead(sessionId, tab.terminalId)
        if (cancelled) return
        term.clear()
        if (prior.output.length > 0) term.write(prior.output)
        publishResize()
        for await (const frame of api.terminalFollow(sessionId, tab.terminalId, followAbort.signal)) {
          if (cancelled) break
          term.write(frame.chunk)
        }
      } catch (reason) {
        if (!cancelled && !followAbort.signal.aborted) {
          setLocalError(reason instanceof Error ? reason.message : String(reason))
        }
      }
    })()

    const onWindowResize = (): void => { publishResize() }
    window.addEventListener('resize', onWindowResize)
    const observer = new ResizeObserver(onWindowResize)
    observer.observe(host)
    return () => {
      cancelled = true
      followAbort.abort()
      dataDisposable.dispose()
      window.removeEventListener('resize', onWindowResize)
      observer.disconnect()
      term.dispose()
      fitRef.current = null
      termRef.current = null
    }
  }, [api, onBusy, sessionId, t, tab.terminalId])

  useEffect(() => {
    if (!active) return
    const fit = fitRef.current
    const term = termRef.current
    if (fit === null || term === null) return
    fit.fit()
    void api.terminalResize(sessionId, tab.terminalId, term.cols, term.rows).catch(() => {})
    term.focus()
  }, [active, api, sessionId, tab.terminalId])

  return <div className={active ? css.bottomTerminalPane : css.bottomTerminalPaneHidden} aria-hidden={!active}>
    {localError !== null && active && <div className={css.error}>{localError}</div>}
    <div ref={hostRef} className={css.bottomTerminalXterm} />
  </div>
}
