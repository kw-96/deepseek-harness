/** 周期会话巡检的失败隔离：单次巡检异常只记录，不得终止承载它的 `dsh web` 进程。 */

import type { BskSessionStore } from './store.js'
import { errorText } from './parse.js'

/** 一次巡检需要的最小会话托管面。 */
export type SweepTarget = Pick<BskSessionStore, 'reapOrphaned' | 'sweepIdle'>

/**
 * 执行一次孤儿回收与空闲回收，异常只记录。
 *
 * 巡检由周期定时器驱动：其中的异常（宿主服务访问失败、bsk 命令异常）若逃逸出去
 * 会成为未处理拒绝，在 Node 24 下直接终止整个 `dsh web` 进程，连带丢掉用户会话。
 * @param target - 会话托管器
 * @param nowMs - 本次巡检的时间戳
 * @param log - 诊断日志出口
 */
export async function runSweep(
  target: SweepTarget,
  nowMs: number,
  log: (message: string) => void,
): Promise<void> {
  try {
    await target.reapOrphaned()
    await target.sweepIdle(nowMs)
  } catch (error) {
    log(`browser-agent: 会话巡检失败：${errorText(error)}`)
  }
}
