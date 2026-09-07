/** 底部持久终端：当前会话的 pwsh PTY 输出、输入、清空和关闭。 */

import { useEffect, useRef, useState } from 'react'
import { Eraser, Terminal, X } from 'lucide-react'
import type { CodexApi } from './RightPanel.js'
import type { SelectorHook, SessionId, SessionListStateLike, TFn } from './faces.js'
import css from './styles.module.css'

interface BottomTerminalPanelProps {
  api: CodexApi
  useSessions: SelectorHook<SessionListStateLike>
  close: () => void
  t: TFn
}

/** 当前会话独占的底部终端面板。 */
export function BottomTerminalPanel({ api, useSessions, close, t }: BottomTerminalPanelProps): React.ReactNode {
  const sessionId = useSessions(state => state.current)
  const cwd = useSessions(state => state.current === undefined ? undefined : state.byId[state.current]?.cwd)
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLPreElement | null>(null)

  useEffect(() => {
    if (sessionId === undefined) return
    let cancelled = false
    setTerminalId(null)
    setOutput('')
    setError(null)
    void api.terminalOpen(sessionId, cwd).then(result => {
      if (cancelled) return
      setTerminalId(result.terminalId)
      setOutput(result.output)
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { cancelled = true }
  }, [api, cwd, sessionId])

  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }) }, [output])

  const send = async (): Promise<void> => {
    if (sessionId === undefined || terminalId === null || input.trim() === '' || busy) return
    const command = input
    setInput('')
    setBusy(true)
    setError(null)
    setOutput(previous => `${previous}${previous.endsWith('\n') || previous === '' ? '' : '\n'}> ${command}\n`)
    try {
      const result = await api.terminalSend(sessionId, terminalId, command)
      setOutput(previous => `${previous}${result.output}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const closeTerminal = async (): Promise<void> => {
    if (sessionId !== undefined && terminalId !== null) await api.terminalClose(sessionId, terminalId).catch(() => {})
    close()
  }

  return <section className={css.bottomTerminal}>
    <header className={css.bottomTerminalHead}>
      <span className={css.bottomTerminalTitle}><Terminal size={14} />{t('bottomTerminal')}</span>
      {cwd !== undefined && <span className={css.bottomTerminalCwd}>{cwd}</span>}
      <button type="button" className={css.iconButton} title={t('bottomTerminalClear')} onClick={() => { setOutput('') }}><Eraser size={14} /></button>
      <button type="button" className={css.iconButton} title={t('bottomTerminalClose')} onClick={() => { void closeTerminal() }}><X size={14} /></button>
    </header>
    {error !== null && <div className={css.error}>{error}</div>}
    <pre ref={bodyRef} className={css.bottomTerminalOutput}>{output === '' ? t('bottomTerminalStarting') : output}</pre>
    <form className={css.bottomTerminalInput} onSubmit={event => { event.preventDefault(); void send() }}>
      <span>&gt;</span>
      <input value={input} disabled={terminalId === null || busy} onChange={event => { setInput(event.target.value) }} placeholder={t('bottomTerminalPlaceholder')} />
    </form>
  </section>
}
