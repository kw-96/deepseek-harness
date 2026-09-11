/**
 * 每个 DSH 会话当前活跃的浏览器会话别名。
 *
 * 只保存「名字」，会话记录本身仍由 `BskSessionStore` 持有；这样多会话的选择
 * 逻辑与存储解耦，删除会话时也不会留下悬空引用。
 */

import { DEFAULT_ALIAS, sessionKey } from './keys.js'

/** 活跃别名注册表。 */
export class AliasRegistry {
  private readonly active = new Map<string, string>()

  /**
   * 设置某个 DSH 会话的活跃别名。
   * @param dshSessionId - DSH 会话 id
   * @param alias - 别名；空串与 `default` 都表示回到默认会话
   */
  set(dshSessionId: string, alias: string): void {
    if (alias === '' || alias === DEFAULT_ALIAS) this.active.delete(dshSessionId)
    else this.active.set(dshSessionId, alias)
  }

  /**
   * 取某个 DSH 会话当前活跃的别名。
   * @param dshSessionId - DSH 会话 id
   * @returns 别名
   */
  get(dshSessionId: string): string {
    return this.active.get(dshSessionId) ?? DEFAULT_ALIAS
  }

  /**
   * 取某个 DSH 会话当前活跃的复合键。
   * @param dshSessionId - DSH 会话 id
   * @returns 复合键
   */
  activeKey(dshSessionId: string): string {
    return sessionKey(dshSessionId, this.get(dshSessionId))
  }

  /**
   * 清掉某个 DSH 会话的活跃别名。
   * @param dshSessionId - DSH 会话 id
   */
  forget(dshSessionId: string): void {
    this.active.delete(dshSessionId)
  }
}
