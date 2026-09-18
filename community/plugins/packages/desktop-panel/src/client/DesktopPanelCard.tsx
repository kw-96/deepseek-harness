/**
 * 桌面面板的设置卡片：显示插件状态、启停开关与面板访问地址。
 * 数据全部来自 host 侧的 /plugin/desktop/state 与 /plugin/desktop/enabled 两个 HTTP 接口，
 * 因此这里不需要 typert remote 通道。
 */
import { useCallback, useEffect, useState } from 'react'

/** 由宿主注入的文案函数。 */
export interface DesktopPanelCardProps {
  /** 按 key 取当前语言的文案。 */
  t: (key: string) => string
}

interface PanelState {
  enabled: boolean
  url: string
  path: string
  workerRunning: boolean
}

const cardStyle: Record<string, string> = {
  border: '1px solid var(--dsw-border, #343a43)',
  borderRadius: '10px',
  padding: '14px 16px',
  background: 'var(--dsw-surface, rgba(255,255,255,0.02))',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  maxWidth: '640px',
}

const rowStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
}

const buttonStyle: Record<string, string> = {
  border: '1px solid var(--dsw-border, #343a43)',
  borderRadius: '6px',
  padding: '5px 14px',
  cursor: 'pointer',
  background: 'transparent',
  color: 'inherit',
  fontSize: '13px',
}

const onButtonStyle: Record<string, string> = {
  ...buttonStyle,
  background: 'var(--dsw-accent, #2d5bd7)',
  borderColor: 'var(--dsw-accent, #2d5bd7)',
  color: '#fff',
}

const codeStyle: Record<string, string> = {
  fontFamily: 'Consolas, Menlo, monospace',
  fontSize: '12px',
  padding: '3px 8px',
  borderRadius: '6px',
  background: 'rgba(127,127,127,0.14)',
  wordBreak: 'break-all',
}

/**
 * 桌面面板设置卡片。
 * @param props 宿主注入的文案函数
 * @returns 卡片元素
 */
export function DesktopPanelCard({ t }: DesktopPanelCardProps) {
  const [state, setState] = useState<PanelState | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/plugin/desktop/state', { cache: 'no-store' })
      setState(await response.json() as PanelState)
      setFailure('')
    } catch {
      setFailure(t('loadFailed'))
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  const toggle = useCallback(async (): Promise<void> => {
    if (state === null || busy) return
    setBusy(true)
    try {
      await fetch('/plugin/desktop/enabled', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !state.enabled }),
      })
      await load()
    } catch {
      setFailure(t('toggleFailed'))
    } finally {
      setBusy(false)
    }
  }, [busy, load, state, t])

  const copy = useCallback(async (): Promise<void> => {
    if (state === null) return
    try {
      await navigator.clipboard.writeText(state.url)
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 1500)
    } catch {
      setFailure(t('toggleFailed'))
    }
  }, [state, t])

  if (state === null) {
    return <div style={cardStyle}>{failure === '' ? t('loading') : failure}</div>
  }

  return (
    <div style={cardStyle}>
      <div style={{ ...rowStyle, justifyContent: 'space-between' }}>
        <strong style={{ fontSize: '15px' }}>{t('title')}</strong>
        <button
          type="button"
          disabled={busy}
          onClick={() => { void toggle() }}
          style={state.enabled ? onButtonStyle : buttonStyle}
        >
          {busy ? '…' : state.enabled ? t('disable') : t('enable')}
        </button>
      </div>

      <div style={{ opacity: 0.75, fontSize: '13px' }}>{t('description')}</div>

      <div style={rowStyle}>
        <span style={{ opacity: 0.75, fontSize: '13px', minWidth: '64px' }}>{t('address')}</span>
        <code style={codeStyle}>{state.url}</code>
        <button type="button" style={buttonStyle} onClick={() => { void copy() }}>
          {copied ? t('copied') : t('copy')}
        </button>
      </div>

      <div style={{ ...rowStyle, fontSize: '12px', opacity: 0.7 }}>
        <span>{state.enabled ? t('stateEnabled') : t('stateDisabled')}</span>
        <span>·</span>
        <span>{state.workerRunning ? t('workerRunning') : t('workerStopped')}</span>
        {failure === '' ? null : <span style={{ color: 'var(--dsw-danger, #d9534f)' }}>{failure}</span>}
      </div>
    </div>
  )
}
