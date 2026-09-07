/** Cursor-style interactive bottom terminal: xterm.js + live PTY write/follow/resize. */

import { useEffect, useRef, useState } from 'react'
import { Eraser, Terminal, X } from 'lucide-react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { CodexApi } from './RightPanel.js'
import type { SelectorHook, SessionListStateLike, TFn } from './faces.js'
import css from './styles.module.css'

interface BottomTerminalPanelProps {
  api: CodexApi
  useSessions: SelectorHook<SessionListStateLike>
  close: () => void
  t: TFn
}

/** 当前会话独占的交互式底栏终端面板。 */
export function BottomTerminalPanel({ api, useSessions, close, t }: BottomTerminalPanelProps): React.ReactNode {
  const sessionId = useSessions(state => state.current)
  const cwd = useSessions(state => state.current === undefined ? undefined : state.byId[state.current]?.cwd)
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  terminalIdRef.current = terminalId

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
    fit.fit()
    xtermRef.current = term
    fitRef.current = fit
    return () => {
      term.dispose()
      xtermRef.current = null
      fitRef.current = null
    }
  }, [])

  useEffect(() => {
    if (sessionId === undefined) return
    const term = xtermRef.current
    const fit = fitRef.current
    if (term === null || fit === null) return
    let cancelled = false
    const followAbort = new AbortController()
    let dataDisposable: { dispose(): void } | undefined
    setTerminalId(null)
    setError(null)
    term.reset()
    term.writeln(t('bottomTerminalStarting'))

    const publishResize = (id: string): void => {
      fit.fit()
      const { cols, rows } = term
      void api.terminalResize(sessionId, id, cols, rows).catch(() => {})
    }

    void (async () => {
      try {
        const opened = await api.terminalOpen(sessionId, cwd)
        if (cancelled) return
        setTerminalId(opened.terminalId)
        term.clear()
        if (opened.output.length > 0) term.write(opened.output)
        publishResize(opened.terminalId)
        dataDisposable = term.onData((data) => {
          const id = terminalIdRef.current
          if (id === null) return
          void api.terminalWrite(sessionId, id, data).catch(reason => {
            if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
          })
        })
        for await (const frame of api.terminalFollow(sessionId, opened.terminalId, followAbort.signal)) {
          if (cancelled) break
          term.write(frame.chunk)
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      }
    })()

    const onWindowResize = (): void => {
      const id = terminalIdRef.current
      if (id === null) return
      publishResize(id)
    }
    window.addEventListener('resize', onWindowResize)
    const observer = new ResizeObserver(onWindowResize)
    if (hostRef.current !== null) observer.observe(hostRef.current)
    return () => {
      cancelled = true
      followAbort.abort()
      dataDisposable?.dispose()
      window.removeEventListener('resize', onWindowResize)
      observer.disconnect()
    }
  }, [api, cwd, sessionId, t])

  const closeTerminal = async (): Promise<void> => {
    if (sessionId !== undefined && terminalId !== null) {
      await api.terminalClose(sessionId, terminalId).catch(() => {})
    }
    close()
  }

  return <section className={css.bottomTerminal}>
    <header className={css.bottomTerminalHead}>
      <span className={css.bottomTerminalTitle}><Terminal size={14} />{t('bottomTerminal')}</span>
      {cwd !== undefined && <span className={css.bottomTerminalCwd}>{cwd}</span>}
      <button type="button" className={css.iconButton} title={t('bottomTerminalClear')}
        onClick={() => { xtermRef.current?.clear() }}><Eraser size={14} /></button>
      <button type="button" className={css.iconButton} title={t('bottomTerminalClose')}
        onClick={() => { void closeTerminal() }}><X size={14} /></button>
    </header>
    {error !== null && <div className={css.error}>{error}</div>}
    <div ref={hostRef} className={css.bottomTerminalXterm} />
  </section>
}
