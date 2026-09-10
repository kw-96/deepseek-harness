/** 文件面板底部 git 时间线：选中文件时显示该文件的提交历史，否则显示仓库最近提交。 */

import { useEffect, useState } from 'react'
import { GitCommitHorizontal, History } from 'lucide-react'
import type { CodexApi } from '../../RightPanel.js'
import type { GitLogResponse } from 'dsh-codex-shell/types'
import type { TFn } from '../../faces.js'
import { timeAgo } from '../git/support.js'
import css from '../../styles.module.css'

export interface FilesTimelineProps {
  api: CodexApi
  cwd: string
  /** 当前选中的文件；null 时展示仓库最近提交。 */
  path: string | null
  t: TFn
}

function displayName(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx < 0 ? path : path.slice(idx + 1)
}

/**
 * 文件对应的 git 提交时间线（IDE 时间线模式）。
 * @param props API、仓库目录、选中文件与文案
 */
export function FilesTimeline({ api, cwd, path, t }: FilesTimelineProps): React.ReactNode {
  const [log, setLog] = useState<GitLogResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    setLog(null)
    api.gitLog(cwd, 30, path ?? undefined)
      .then(result => { if (!cancelled) setLog(result) })
      .catch(() => { if (!cancelled) setLog({ entries: [] }) })
    return () => { cancelled = true }
  }, [api, cwd, path])

  const scope = path === null ? t('timelineScopeRepo') : displayName(path)
  return (
    <div className={css.filesTimeline}>
      <div className={css.filesTimelineHead}>
        <History size={13} style={{ flex: 'none' }} />
        <span style={{ flex: 'none' }}>{t('timelineTitle')}</span>
        <span className={css.filesTimelineScope} title={scope}>{scope}</span>
      </div>
      <div className={css.filesTimelineScroll}>
        {log === null
          ? <div className={css.note} style={{ padding: '4px 4px' }}>…</div>
          : log.entries.length === 0
            ? <div className={css.note} style={{ padding: '4px 4px' }}>{t('timelineEmpty')}</div>
            : log.entries.map(entry => (
              <div key={entry.hash} className={css.gitTimelineItem} title={entry.subject}>
                <span className={css.gitTimelineRail} aria-hidden="true"><span /></span>
                <GitCommitHorizontal size={13} className={css.gitTimelineIcon} aria-hidden="true" />
                <span className={css.gitTimelineBody}>
                  <span className={css.gitTimelineSubject}>{entry.subject}</span>
                  <span className={css.gitTimelineMeta}>{entry.hash} · {entry.author} · {timeAgo(t, entry.date)}</span>
                </span>
                {entry.refs !== '' && <span className={css.gitTimelineRefs}>{entry.refs}</span>}
              </div>
            ))}
      </div>
    </div>
  )
}
