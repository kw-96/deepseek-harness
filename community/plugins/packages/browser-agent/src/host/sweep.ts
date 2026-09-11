/**
 * 会话回收：空闲超时、宿主会话已不存在、插件卸载/DSH 会话结束。
 *
 * 周期巡检由定时器驱动，其中的异常（宿主服务访问失败、bsk 命令异常）若逃逸出去
 * 会成为未处理拒绝，在 Node 24 下直接终止整个 `dsh web` 进程，连带丢掉用户会话，
 * 因此巡检入口统一捕获并只记日志。
 */

import type { BskSessionRecord } from './config.js'
import { errorText } from './parse.js'
import { dshSessionOf } from './session/keys.js'

/** 回收所需的最小会话托管面。 */
export interface ReclaimStore {
  /** 当前所有复合键。 */
  keys(): string[]
  /** 某个复合键当前的记录。 */
  peek(key: string): BskSessionRecord | undefined
  /** 结束一个会话；返回是否确实结束了。 */
  stop(key: string, reason: string): Promise<boolean>
  /** 清掉某个 DSH 会话的活跃别名。 */
  forgetActive(dshSessionId: string): void
  /** 宿主会话是否仍然存在；未提供判定函数时视为存在。 */
  ownerAlive(dshSessionId: string): boolean
  /** 空闲上限（毫秒）。 */
  idleTimeoutMs(): number
}

/**
 * 结束某个 DSH 会话名下的全部 bsk 会话（含所有别名）。
 * @param store - 会话托管面
 * @param dshSessionId - DSH 会话 id
 * @param reason - 触发原因
 * @returns 被结束的复合键
 */
export async function stopAllOf(store: ReclaimStore, dshSessionId: string, reason: string): Promise<string[]> {
  const keys = store.keys().filter(key => dshSessionOf(key) === dshSessionId)
  for (const key of keys) await store.stop(key, reason)
  store.forgetActive(dshSessionId)
  return keys
}

/**
 * 结束本插件启动的全部会话（插件卸载时的兜底）。
 * @param store - 会话托管面
 * @param reason - 触发原因
 */
export async function stopEverything(store: ReclaimStore, reason: string): Promise<void> {
  await Promise.all(store.keys().map(async (key) => await store.stop(key, reason)))
}

/**
 * 回收空闲超时的会话。
 * @param store - 会话托管面
 * @param nowMs - 当前时间
 * @returns 被结束的复合键
 */
export async function sweepIdle(store: ReclaimStore, nowMs: number): Promise<string[]> {
  const idleTimeoutMs = store.idleTimeoutMs()
  const expired = store.keys().filter((key) => {
    const record = store.peek(key)
    return record !== undefined && nowMs - record.lastActionAtMs > idleTimeoutMs
  })
  for (const key of expired) await store.stop(key, '空闲超时自动回收')
  return expired
}

/**
 * 回收宿主会话已不存在的记录。
 * @param store - 会话托管面
 * @returns 被结束的复合键
 */
export async function reapOrphaned(store: ReclaimStore): Promise<string[]> {
  const orphaned = store.keys().filter(key => !store.ownerAlive(dshSessionOf(key)))
  for (const key of orphaned) await store.stop(key, '宿主会话已不存在')
  return orphaned
}

/**
 * 执行一次孤儿回收与空闲回收，异常只记录。
 * @param store - 会话托管面
 * @param nowMs - 本次巡检的时间戳
 * @param log - 诊断日志出口
 */
export async function runSweep(
  store: ReclaimStore,
  nowMs: number,
  log: (message: string) => void,
): Promise<void> {
  try {
    await reapOrphaned(store)
    await sweepIdle(store, nowMs)
  } catch (error) {
    log(`browser-agent: 会话巡检失败：${errorText(error)}`)
  }
}
