/** Graph 区：工具栏（定位/抓取/拉取/推送/刷新）与提交泳道列表。 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, CloudDownload, GitBranch, LocateFixed, RefreshCw, Tag } from 'lucide-react'
import type { GitLogResponse } from '../types.js'
import { LANE_WIDTH, computeGraph, laneColor } from './graph-lanes.js'
import { parseRefs, timeAgo } from './format.js'
import type { TFn } from './faces.js'
import css from './styles.module.css'

export interface GraphProps {
  t: TFn
  log: GitLogResponse | null
  branch: string | null
  busy: boolean
  /** 递增即触发「跳到当前历史记录项」。 */
  locateSignal: number
  onLocate: () => void
  onFetch: () => void
  onPull: () => void
  onPush: () => void
  onRefresh: () => void
}

/**
 * Graph 区。
 * @param props 历史、分支与工具栏回调
 */
export function Graph(props: GraphProps): React.ReactNode {
  const { t, log, branch, busy, locateSignal, onLocate, onFetch, onPull, onPush, onRefresh } = props
  const rows = useMemo(() => computeGraph(log?.entries ?? []), [log])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [flash, setFlash] = useState(false)

  // 「跳到当前历史记录项」：滚到最新一条并短暂高亮。
  useEffect(() => {
    if (locateSignal === 0) return
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    setFlash(true)
    const timer = window.setTimeout(() => { setFlash(false) }, 1200)
    return () => { window.clearTimeout(timer) }
  }, [locateSignal])

  return (
    <div className={css.graph}>
      <div className={css.graphHead}>
        <span className={css.graphTitle}>{t('graph')}</span>
        <span className={css.graphSpacer} />
        <button type="button" className={css.iconButton} title={t('locate')} aria-label={t('locate')} onClick={onLocate}>
          <LocateFixed size={13} />
        </button>
        <button type="button" className={css.iconButton} title={t('fetch')} aria-label={t('fetch')} disabled={busy} onClick={onFetch}>
          <CloudDownload size={13} />
        </button>
        <button type="button" className={css.iconButton} title={t('pull')} aria-label={t('pull')} disabled={busy} onClick={onPull}>
          <ArrowDownToLine size={13} />
        </button>
        <button type="button" className={css.iconButton} title={t('push')} aria-label={t('push')} disabled={busy} onClick={onPush}>
          <ArrowUpFromLine size={13} />
        </button>
        <button type="button" className={css.iconButton} title={t('refresh')} aria-label={t('refresh')} disabled={busy} onClick={onRefresh}>
          <RefreshCw size={13} className={busy ? css.spinning : undefined} />
        </button>
      </div>
      <div className={css.graphScroll} ref={scrollRef}>
        {log === null
          ? <div className={css.note}>{t('loading')}</div>
          : log.entries.length === 0
            ? <div className={css.empty}>{log.error ?? t('noCommits')}</div>
            : rows.map((row, index) => {
              const width = (Math.max(...row.columns, row.lane) + 1) * LANE_WIDTH
              return (
                <div key={row.commit.hash}
                  className={flash && index === 0 ? `${css.commit} ${css.commitFlash}` : css.commit}
                  title={row.commit.subject}>
                  <span className={css.lanes} style={{ width }}>
                    {row.columns.map(column => (
                      <span key={column} className={css.laneLine}
                        style={{ left: column * LANE_WIDTH + LANE_WIDTH / 2 - 1, background: laneColor(column) }} />
                    ))}
                    <span className={css.commitNode}
                      style={{
                        left: row.lane * LANE_WIDTH + 2,
                        borderColor: laneColor(row.lane),
                        background: row.merge ? 'transparent' : laneColor(row.lane),
                      }} />
                  </span>
                  <span className={css.commitBody}>
                    <span className={css.commitSubject}>{row.commit.subject}</span>
                    <span className={css.commitMeta}>
                      {row.commit.shortHash} · {row.commit.author} · {timeAgo(t, row.commit.date)}
                    </span>
                  </span>
                  <span className={css.badges}>
                    {parseRefs(row.commit.refs, branch).map(badge => (
                      <span key={badge.label}
                        className={badge.kind === 'head' ? `${css.badge} ${css.badgeHead}` : badge.kind === 'tag' ? `${css.badge} ${css.badgeTag}` : css.badge}>
                        {badge.kind === 'tag' ? <Tag size={10} aria-hidden="true" /> : <GitBranch size={10} aria-hidden="true" />}
                        {badge.label}
                      </span>
                    ))}
                  </span>
                </div>
              )
            })}
      </div>
    </div>
  )
}
