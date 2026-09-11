/**
 * 会话列表投影：把托管器里的记录整理成面板与 `browser_session` 需要的形状。
 */

import type { BskSessionRecord } from '../config.js'
import { aliasOf, dshSessionOf } from './keys.js'

/** 一个会话条目的投影。 */
export interface SessionEntry {
  /** 复合键。 */
  key: string
  /** 别名。 */
  alias: string
  /** 是否为当前活跃会话。 */
  active: boolean
  /** 运行态记录。 */
  record: BskSessionRecord
}

/**
 * 本插件启动的全部 bsk 会话 id（不含已丢弃的记录）。
 * @param records - 记录集合
 * @returns bsk 会话 id 列表
 */
export function ownedSessionIds(records: Iterable<BskSessionRecord>): string[] {
  return [...records].map(record => record.bskSessionId)
}

/**
 * 列出某个 DSH 会话名下的会话，活跃的排在最前。
 * @param entries - 复合键与记录的集合
 * @param dshSessionId - DSH 会话 id
 * @param activeKey - 当前活跃的复合键
 * @returns 会话条目列表
 */
export function sessionsOf(
  entries: Iterable<[string, BskSessionRecord]>,
  dshSessionId: string,
  activeKey: string,
): SessionEntry[] {
  return [...entries]
    .filter(([key]) => dshSessionOf(key) === dshSessionId)
    .map(([key, record]) => ({ key, alias: aliasOf(key), active: key === activeKey, record }))
    .sort((left, right) => {
      if (left.active !== right.active) return left.active ? -1 : 1
      return left.alias.localeCompare(right.alias)
    })
}
