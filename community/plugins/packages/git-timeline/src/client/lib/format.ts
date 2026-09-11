/** 面板里的纯展示逻辑：状态字母、路径拆分、相对时间、分支引用解析。 */

import type { GitEntry } from '../../types.js'
import type { TFn } from './faces.js'

/** 未合并（冲突）条目：XY 含 U，或双方同为 A/D。 */
export function isConflict(xy: string): boolean {
  if (xy === '??') return false
  if (xy.includes('U')) return true
  const [index, work] = [xy.slice(0, 1), xy.slice(1, 2)]
  return (index === 'A' && work === 'A') || (index === 'D' && work === 'D')
}

/** porcelain 的 XY 状态码转单字母展示；冲突统一显示 `!`。 */
export function statusLetter(xy: string): string {
  if (isConflict(xy)) return '!'
  if (xy === '??') return 'U'
  const stripped = xy.replaceAll(' ', '').replaceAll('.', '')
  if (stripped === '') return 'M'
  const letter = stripped.slice(0, 1)
  return letter === '?' ? 'U' : letter
}

/** 状态字母的类型：冲突 / 改动 / 新增 / 删除，用于配色。 */
export function statusKind(xy: string): 'modified' | 'added' | 'deleted' | 'conflict' {
  if (isConflict(xy)) return 'conflict'
  const letter = statusLetter(xy)
  if (letter === 'A' || letter === 'U') return 'added'
  if (letter === 'D') return 'deleted'
  return 'modified'
}

/** 拆分路径为「文件名 + 目录」两段（无目录时第二段为空）。 */
export function splitPath(path: string): { name: string; dir: string } {
  const normalized = path.replaceAll('\\', '/')
  const index = normalized.lastIndexOf('/')
  if (index < 0) return { name: normalized, dir: '' }
  return { name: normalized.slice(index + 1), dir: normalized.slice(0, index + 1) }
}

/** 条目展示路径：重命名显示「原名 → 新名」。 */
export function entryLabel(entry: GitEntry): string {
  return entry.origPath === null ? entry.path : `${entry.origPath} → ${entry.path}`
}

/** `%ai` 时间转相对时间。 */
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

/** 一条提交引用徽标。 */
export interface RefBadge { label: string; kind: 'branch' | 'tag' | 'head' }

/**
 * 解析 `%D` 装饰（形如 `HEAD -> dev, origin/dev, tag: v1.0`）。
 * @param refs `%D` 原文
 * @param branch 当前分支名（用于标记当前项）
 * @returns 徽标列表
 */
export function parseRefs(refs: string, branch: string | null): RefBadge[] {
  const badges: RefBadge[] = []
  for (const raw of refs.split(',').map(part => part.trim()).filter(part => part !== '')) {
    if (raw.startsWith('tag: ')) { badges.push({ label: raw.slice(5), kind: 'tag' }); continue }
    const head = raw.startsWith('HEAD -> ')
    const label = head ? raw.slice('HEAD -> '.length) : raw
    const isCurrent = head || (branch !== null && label === branch)
    badges.push({ label, kind: isCurrent ? 'head' : 'branch' })
  }
  return badges
}
