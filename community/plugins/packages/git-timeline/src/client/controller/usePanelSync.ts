/** 面板与宿主的同步：首次加载与「会话写入 → 重读状态」的自动刷新。 */

import { useEffect } from 'react'
import { reasonText } from './state.js'
import type { WorkspaceChangeFace } from '../lib/faces.js'

/** 自动刷新去抖：一次保存会连着来几帧。 */
const CHANGE_DEBOUNCE_MS = 400

export interface UsePanelSyncOptions {
  sessionId: string
  cwd: string | undefined
  files: WorkspaceChangeFace | undefined
  /** 全量刷新（状态 + 历史 + 身份），依赖变化时重跑首次加载。 */
  refresh: () => Promise<void>
  /** 只重读工作区状态与展开中的差异。 */
  refreshStatus: () => Promise<void>
  onError: (message: string) => void
}

/**
 * 挂载面板的两次同步：进入时全量读取；会话写入时去抖重读状态。
 * @param options 会话、工作目录、变更流与两个刷新回调
 */
export function usePanelSync(options: UsePanelSyncOptions): void {
  const { sessionId, cwd, files, refresh, refreshStatus, onError } = options

  useEffect(() => {
    if (cwd === undefined) return
    let cancelled = false
    refresh().catch((reason: unknown) => {
      if (!cancelled) onError(reasonText(reason))
    })
    return () => { cancelled = true }
  }, [cwd, refresh, onError])

  // 会话文件变更 → 去抖后只重读工作区状态（写入不会改提交历史）。
  useEffect(() => {
    if (files === undefined || cwd === undefined) return
    const controller = new AbortController()
    let timer: number | undefined
    void (async () => {
      try {
        for await (const _frame of files.changes(sessionId, controller.signal)) {
          if (controller.signal.aborted) break
          if (timer !== undefined) window.clearTimeout(timer)
          timer = window.setTimeout(() => {
            refreshStatus().catch(() => { /* 自动刷新失败不打断面板 */ })
          }, CHANGE_DEBOUNCE_MS)
        }
      } catch {
        // 流结束（会话关闭或宿主退出）：静默停止，重新挂载时再连。
      }
    })()
    return () => {
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [sessionId, cwd, files, refreshStatus])
}
