/**
 * 浏览器面板：展示 Agent Window 的会话状态、标签页与最近截图，并提供
 * 手动刷新与结束会话。写操作只在 Host 侧发生，这里只读状态。
 */

import { useCallback, useEffect, useState } from 'react'
import type { BrowserPanelSnapshot, BrowserPreviewResult } from '../types.js'
import type { BrowserPanelApi } from './faces.js'
import type { TFn } from './faces.js'
import styles from './styles.module.css'

/** 面板注入的依赖与运行时 props。 */
export interface BrowserBodyInjected {
  api: BrowserPanelApi
  t: TFn
}

/** 组件 props：槽位运行时注入的 sessionId 加上本插件的注入面。 */
export type BrowserBodyProps = BrowserBodyInjected & { sessionId: string }

/**
 * 浏览器面板主体。
 * @param props - 会话 id 与面板 API
 */
export function BrowserBody({ sessionId, api, t }: BrowserBodyProps): React.ReactNode {
  const [snapshot, setSnapshot] = useState<BrowserPanelSnapshot | null>(null)
  const [preview, setPreview] = useState<BrowserPreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setSnapshot(await api.panel(sessionId))
      setError(null)
    } catch (failure) {
      setError(`${t('loadFailed')}：${String(failure)}`)
    }
  }, [api, sessionId, t])

  useEffect(() => { void refresh() }, [refresh])

  const stop = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.stop(sessionId)
      setNotice(result.message)
      setPreview(null)
      await refresh()
    } catch (failure) {
      setError(String(failure))
    } finally {
      setBusy(false)
    }
  }, [api, sessionId, refresh])

  const loadPreview = useCallback(async (): Promise<void> => {
    try {
      const result = await api.preview(sessionId)
      setPreview(result)
      if (result.message !== null && result.dataUrl === null) setNotice(result.message)
    } catch (failure) {
      setError(String(failure))
    }
  }, [api, sessionId])

  const session = snapshot?.session
  const page = session?.currentUrl ?? null

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <span className={session?.state === 'open' ? styles.badgeOpen : styles.badgeIdle}>
          {session?.state === 'open' ? t('open') : t('idle')}
        </span>
        {session?.bskSessionId !== null && session?.bskSessionId !== undefined && (
          <span className={styles.meta}>{t('sessionId')} {session.bskSessionId}</span>
        )}
        <span className={styles.spacer} />
        <button type="button" className={styles.button} onClick={() => { void refresh() }}>{t('refresh')}</button>
        <button
          type="button"
          className={styles.button}
          disabled={busy || session?.state !== 'open'}
          onClick={() => { void stop() }}
        >
          {busy ? t('stopping') : t('stop')}
        </button>
      </div>

      {error !== null && <div className={styles.error}>{error}</div>}
      {notice !== null && <div className={styles.notice}>{notice}</div>}
      {snapshot === null && error === null && <div className={styles.empty}>{t('loading')}</div>}

      {snapshot !== null && (
        <div className={styles.scroll}>
          <div className={styles.section}>{t('browser')}</div>
          {snapshot.browsers.length === 0
            ? <div className={styles.empty}>{t('noBrowser')}</div>
            : snapshot.browsers.map(browser => (
              <div key={browser.instanceId} className={styles.row}>
                <span className={styles.strong}>{browser.browserName}</span>
                <span className={styles.meta}>{browser.label} · 扩展 {browser.extensionVersion}</span>
                {browser.versionSkew && <span className={styles.warn}>版本不一致</span>}
              </div>
            ))}

          <div className={styles.section}>{t('currentPage')}</div>
          {page === null || page === ''
            ? <div className={styles.empty}>{t('noPage')}</div>
            : (
              <div className={styles.row}>
                <span className={styles.strong}>{session?.pageTitle === null || session?.pageTitle === '' ? page : session?.pageTitle}</span>
                <span className={styles.metaBreak}>{page}</span>
              </div>
            )}

          <div className={styles.section}>{t('tabs')}</div>
          {snapshot.tabs.length === 0
            ? <div className={styles.empty}>{t('noTabs')}</div>
            : snapshot.tabs.map(tab => (
              <div key={tab.tabId} className={styles.row}>
                <span className={styles.strong}>{tab.title === '' ? tab.url : tab.title}</span>
                <span className={styles.metaBreak}>{tab.tabId} · {tab.url}</span>
              </div>
            ))}

          <div className={styles.section}>{t('screenshot')}</div>
          {snapshot.lastScreenshotPath === null
            ? <div className={styles.empty}>{t('noScreenshot')}</div>
            : (
              <div className={styles.row}>
                <span className={styles.metaBreak}>{snapshot.lastScreenshotPath}</span>
                <span className={styles.buttonRow}>
                  <button type="button" className={styles.button} onClick={() => { void loadPreview() }}>
                    {preview === null ? t('showPreview') : t('hidePreview')}
                  </button>
                </span>
              </div>
            )}
          {preview?.dataUrl !== null && preview?.dataUrl !== undefined && (
            <img className={styles.preview} src={preview.dataUrl} alt={t('screenshot')} />
          )}
          {preview !== null && preview.dataUrl === null && (
            <div className={styles.empty}>{t('previewFailed')}</div>
          )}
        </div>
      )}
    </div>
  )
}
