/** Git 面板的纯逻辑：状态字母推导、差异着色、路径筛选与相对时间。 */

import type { TFn } from '../../faces.js'

/** 与宿主 GitStatusResponse.entries 对应的本地条目面。 */
export interface GitEntryLike {
  path: string
  origPath: string | null
  xy: string
}

/** 单字母文件状态码（VSCode 风格）。 */
export type StatusLetter = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!' | ' '

/**
 * 从 porcelain-v2 XY 码推导单字母状态。
 * @param entry 状态条目
 * @param index true 取索引侧（暂存），false 取工作区侧（未暂存）
 * @returns 状态字母；无变化时为空格
 */
export function statusLetter(entry: GitEntryLike, index: boolean): StatusLetter {
  const code = index ? entry.xy[0] : entry.xy[1]
  switch (code) {
    case 'M': case 'A': case 'D': case 'R': case 'C': case 'U': case '?': case '!': return code
    default: return ' '
  }
}

/** 是否未跟踪（xy === '??'）。 */
export function isUntracked(entry: GitEntryLike): boolean {
  return entry.xy === '??'
}

/** 展示路径：重命名条目显示「原路径 → 新路径」。 */
export function displayPath(entry: GitEntryLike): string {
  return entry.origPath === null ? entry.path : `${entry.origPath} → ${entry.path}`
}

/** 路径筛选：大小写不敏感的包含匹配，空白查询放行全部。 */
export function matchesFilter(path: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return needle === '' || path.toLowerCase().includes(needle)
}

export type DiffLineKind = 'add' | 'del' | 'meta' | 'hunk' | 'context'

export interface DiffLine { kind: DiffLineKind; text: string }

/**
 * 把 unified diff 文本拆成带类别的行，供着色渲染。
 * @param text diff 原始文本
 * @returns 逐行类别与内容
 */
export function parseDiff(text: string): readonly DiffLine[] {
  return text.split('\n').map(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) return { kind: 'add', text: line }
    if (line.startsWith('-') && !line.startsWith('---')) return { kind: 'del', text: line }
    if (line.startsWith('@@')) return { kind: 'hunk', text: line }
    if (
      line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---')
      || line.startsWith('+++') || line.startsWith('new file') || line.startsWith('deleted file')
      || line.startsWith('similarity') || line.startsWith('rename') || line.startsWith('Binary files')
    ) return { kind: 'meta', text: line }
    return { kind: 'context', text: line }
  })
}

/**
 * git 日志日期到「刚刚 / n 分钟前 / n 小时前 / n 天前」的相对时间。
 * @param t 文案函数
 * @param iso `%ai` 格式的提交时间
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
