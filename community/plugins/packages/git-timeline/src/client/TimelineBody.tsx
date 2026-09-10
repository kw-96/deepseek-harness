/**
 * 右栏「Git 时间线」标签体：路径筛选 + 变更文件快捷选择 + 提交时间线。
 *
 * 数据全部来自注入面（Host 的 gitTimeline Remote）；组件只保留视图状态，
 * 注入函数经 ref 读取，避免注入对象身份变化触发重复拉取。
 */

import { useEffect, useRef, useState } from 'react'
import { GitCommitHorizontal, RefreshCw, X } from 'lucide-react'
import type { ChangedFile, ChangedResponse, GitLogResponse } from '../types.js'
import type { TFn, TimelineBodyRuntimeProps } from './faces.js'
import css from './styles.module.css'

/** 变更文件快捷选择的展示上限。 */
const MAX_CHIPS = 12

export interface TimelineBodyInjected {
  /** 读取提交日志；path 为空串表示整个仓库。 */
  log: (cwd: string, path: string) => Promise<GitLogResponse>
  /** 读取工作区变更清单。 */
  changed: (cwd: string) => Promise<ChangedResponse>
}

export interface TimelineBodyProps extends TimelineBodyRuntimeProps, TimelineBodyInjected {
  t: TFn
}

/**
 * porcelain 的 XY 状态码转单字母展示。
 * @param status 两字符状态码（如 ` M`、`??`、`R `）
 * @returns 单字母状态
 */
export function statusLetter(status: string): string {
  if (status === '??') return '?'
  const stripped = status.replaceAll(' ', '')
  return stripped === '' ? '?' : stripped.slice(0, 1)
}

/**
 * `%ai` 时间转相对时间。
 * @param t 文案函数
 * @param iso 提交时间
 * @returns 相对时间文案
 */
export function timeAgo(t: TFn, iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  const minutes = Math.floor((Date.now() - time) / 60_000)
  if (minutes < 1) return t('timeNow')
  if (minutes < 60) return t('timeMinAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('timeHourAgo', { n: hours })
  return t('timeDayAgo', { n: Math.floor(hours / 24) })
}

/**
 * 时间线标签体。
 * @param props 会话运行时 props、注入的远端读取与文案
 */
export function TimelineBody({ sessionId, useSessions, t, log, changed }: TimelineBodyProps): React.ReactNode {
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('')
  const [revision, setRevision] = useState(0)
  const [logState, setLogState] = useState<GitLogResponse | null>(null)
  const [logError, setLogError] = useState<string | null>(null)
  const [changedState, setChangedState] = useState<ChangedResponse | null>(null)
  const injected = useRef({ log, changed })
  injected.current = { log, changed }

  // 输入防抖：停止输入 300 毫秒后应用筛选。
  useEffect(() => {
    if (draft === filter) return
    const timer = window.setTimeout(() => { setFilter(draft) }, 300)
    return () => { window.clearTimeout(timer) }
  }, [draft, filter])

  useEffect(() => {
    if (cwd === undefined) return
    let cancelled = false
    setLogState(null)
    setLogError(null)
    injected.current.log(cwd, filter).then(
      (result) => { if (!cancelled) setLogState(result) },
      (error: unknown) => { if (!cancelled) setLogError(error instanceof Error ? error.message : String(error)) },
    )
    return () => { cancelled = true }
  }, [cwd, filter, revision])

  useEffect(() => {
    if (cwd === undefined) return
    let cancelled = false
    injected.current.changed(cwd).then(
      (result) => { if (!cancelled) setChangedState(result) },
      () => { if (!cancelled) setChangedState(null) },
    )
    return () => { cancelled = true }
  }, [cwd, revision])

  const pick = (file: ChangedFile): void => { setDraft(file.path); setFilter(file.path) }
  const clearFilter = (): void => { setDraft(''); setFilter('') }
  const scope = filter === '' ? t('scopeRepo') : filter
  const changedFiles = changedState?.repo === true ? changedState.files.slice(0, MAX_CHIPS) : []

  if (cwd === undefined) return <div className={css.empty}>{t('notRepo')}</div>

  return (
    <div className={css.root}>
      <div className={css.head}>
        <span className={css.rootPath} title={logState?.root ?? cwd}>{logState?.root ?? cwd}</span>
        <button type="button" className={css.iconButton} title={t('refresh')} aria-label={t('refresh')}
          onClick={() => { setRevision(value => value + 1) }}>
          <RefreshCw size={13} />
        </button>
      </div>
      <div className={css.filterRow}>
        <input className={css.input} value={draft} placeholder={t('filterPlaceholder')}
          aria-label={t('filterPlaceholder')}
          onChange={(event) => { setDraft(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') setFilter(draft) }} />
        {filter !== '' && (
          <button type="button" className={css.iconButton} title={t('filterClear')} aria-label={t('filterClear')}
            onClick={clearFilter}>
            <X size={13} />
          </button>
        )}
      </div>
      {changedFiles.length > 0 && (
        <div className={css.changedWrap}>
          <span className={css.changedLabel}>{t('changedTitle')}</span>
          {changedFiles.map(file => (
            <button key={`${file.status}:${file.path}`} type="button"
              className={file.path === filter ? `${css.chip} ${css.chipOn}` : css.chip}
              title={file.path} onClick={() => { pick(file) }}>
              <span className={css.chipStatus}>{statusLetter(file.status)}</span>
              <span className={css.chipPath}>{file.path}</span>
            </button>
          ))}
        </div>
      )}
      <div className={css.scroll}>
        {logError !== null
          ? <div className={css.error}>{logError}</div>
          : logState === null
            ? <div className={css.note}>{t('loading')}</div>
            : !logState.repo
              ? <div className={css.empty}>{t('notRepo')}</div>
              : logState.entries.length === 0
                ? <div className={css.empty}>{logState.error ?? t('empty')}</div>
                : (
                  <>
                    <div className={css.changedLabel}>{scope}</div>
                    {logState.entries.map(entry => (
                      <div key={entry.hash} className={css.item} title={entry.subject}>
                        <span className={css.rail} aria-hidden="true"><span className={css.railDot} /></span>
                        <GitCommitHorizontal size={13} className={css.itemIcon} aria-hidden="true" />
                        <span className={css.itemBody}>
                          <span className={css.subject}>{entry.subject}</span>
                          <span className={css.meta}>{entry.hash} · {entry.author} · {timeAgo(t, entry.date)}</span>
                        </span>
                        {entry.refs !== '' && <span className={css.refs}>{entry.refs}</span>}
                      </div>
                    ))}
                  </>
                )}
      </div>
    </div>
  )
}
