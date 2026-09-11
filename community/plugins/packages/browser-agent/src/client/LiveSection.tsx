/**
 * 实时观测区：轮询当前动作与耗时，提供中断按钮，并按较慢的节奏刷新截图。
 *
 * 两条节奏是刻意的——`live` 只回状态（很轻，1 秒一次），`preview` 要读图（约 2.5 秒一次），
 * 因此面板打开时的开销可控。
 */

import { useCallback, useEffect, useState } from 'react'
import type { BrowserLiveView } from '../types.js'
import type { BrowserPanelApi, TFn } from './faces.js'
import styles from './styles.module.css'

/** 状态轮询间隔（毫秒）。 */
const LIVE_POLL_MS = 1000
/** 截图刷新间隔（毫秒）。 */
const PREVIEW_POLL_MS = 2500

/** 实时区 props。 */
export interface LiveSectionProps {
  sessionId: string
  api: BrowserPanelApi
  t: TFn
  /** 会话是否处于开启状态；关闭时不轮询。 */
  active: boolean
}

/**
 * 实时观测区。
 * @param props - 会话 id、面板 API 与文案函数
 */
export function LiveSection({ sessionId, api, t, active }: LiveSectionProps): React.ReactNode {
  const [live, setLive] = useState<BrowserLiveView | null>(null)
  const [shot, setShot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!active) {
      setLive(null)
      return undefined
    }
    let cancelled = false
    const tick = async (): Promise<void> => {
      try {
        const value = await api.live(sessionId)
        if (!cancelled) setLive(value)
      } catch {
        // 轮询失败不该反复弹错：状态区保留上一帧即可。
      }
    }
    void tick()
    const timer = window.setInterval(() => { void tick() }, LIVE_POLL_MS)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [active, api, sessionId])

  useEffect(() => {
    if (!active) {
      setShot(null)
      return undefined
    }
    let cancelled = false
    const tick = async (): Promise<void> => {
      try {
        const result = await api.preview(sessionId)
        if (!cancelled) setShot(result.dataUrl)
      } catch {
        // 同上：截图刷新失败只是这一帧没有图。
      }
    }
    void tick()
    const timer = window.setInterval(() => { void tick() }, PREVIEW_POLL_MS)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [active, api, sessionId])

  const interrupt = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await api.interrupt(sessionId)
    } catch {
      // 中断失败会由下一帧轮询体现（动作仍在运行），无需额外提示。
    } finally {
      setBusy(false)
    }
  }, [api, sessionId])

  const running = live?.running === true
  return (
    <div>
      <div className={styles.section}>{t('live')}</div>
      <div className={styles.row}>
        <span className={running ? styles.strong : styles.meta}>
          {running ? `${t('running')} ${live.summary}` : t('noAction')}
        </span>
        {running && live !== null && (
          <span className={styles.meta}>{t('elapsed')} {(live.elapsedMs / 1000).toFixed(1)} 秒</span>
        )}
        <span className={styles.buttonRow}>
          <button
            type="button"
            className={styles.button}
            disabled={busy || !running}
            onClick={() => { void interrupt() }}
          >
            {busy ? t('interrupting') : t('interrupt')}
          </button>
        </span>
      </div>
      {shot !== null && <img className={styles.preview} src={shot} alt={t('live')} />}
    </div>
  )
}
