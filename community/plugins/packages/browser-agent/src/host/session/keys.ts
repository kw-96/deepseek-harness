/**
 * 多会话的复合键：`<dshSessionId>##<alias>`。
 *
 * 默认会话不加后缀，直接沿用 DSH 会话 id，因此单会话路径与历史行为完全一致；
 * DSH 会话 id 不含 `#`，所以分隔符不会与别名混淆。
 */

/** 默认会话别名（不写进复合键）。 */
export const DEFAULT_ALIAS = 'default'
/** 复合键分隔符。 */
const KEY_SEPARATOR = '##'

/**
 * 由 DSH 会话 id 与别名拼出复合键。
 * @param dshSessionId - DSH 会话 id
 * @param alias - 别名；空串与 `default` 都表示默认会话
 * @returns 复合键
 */
export function sessionKey(dshSessionId: string, alias: string): string {
  return alias === '' || alias === DEFAULT_ALIAS ? dshSessionId : `${dshSessionId}${KEY_SEPARATOR}${alias}`
}

/**
 * 从复合键取回 DSH 会话 id。
 * @param key - 复合键
 * @returns DSH 会话 id
 */
export function dshSessionOf(key: string): string {
  const index = key.indexOf(KEY_SEPARATOR)
  return index < 0 ? key : key.slice(0, index)
}

/**
 * 从复合键取回别名。
 * @param key - 复合键
 * @returns 别名；默认会话返回 `default`
 */
export function aliasOf(key: string): string {
  const index = key.indexOf(KEY_SEPARATOR)
  return index < 0 ? DEFAULT_ALIAS : key.slice(index + KEY_SEPARATOR.length)
}
