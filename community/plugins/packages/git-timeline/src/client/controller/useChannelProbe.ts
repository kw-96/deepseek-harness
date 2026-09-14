/** 网络通道状态：打开面板时探测一次，按需重新探测，并支持切换到 SSH 远程。 */

import { useCallback, useEffect, useState } from 'react'
import type { GitChannelStatus } from '../../types.js'
import type { GitPanelApi } from '../lib/faces.js'

/** 探测 hook 的入参。 */
export interface UseChannelProbeOptions {
  cwd: string | undefined
  api: GitPanelApi
  /** 切换远程后的统一刷新入口（复用控制器的忙碌与错误处理）。 */
  refresh: () => Promise<void>
}

/** 探测 hook 的返回值。 */
export interface ChannelProbe {
  status: GitChannelStatus | null
  probing: boolean
  /** 是否正在切换远程地址（用于把动作区分为「探测中」与「切换中」）。 */
  switching: boolean
  reprobe: () => void
  useSsh: () => void
}

/**
 * 探测当前仓库的网络通道。
 *
 * 只在工作目录变化时自动探测一次；重新探测与切换远程都由用户显式触发。
 * 探测本身要真发请求，不宜挂在每次刷新上。
 * @param options 工作目录、注入的 git 面与刷新入口
 * @returns 状态、探测中标记与两个入口
 */
export function useChannelProbe(options: UseChannelProbeOptions): ChannelProbe {
  const { cwd, api, refresh } = options
  const [status, setStatus] = useState<GitChannelStatus | null>(null)
  const [probing, setProbing] = useState(false)
  const [switching, setSwitching] = useState(false)

  const probe = useCallback((cancelled: () => boolean): void => {
    if (cwd === undefined) return
    setProbing(true)
    api.channelStatus(cwd)
      .then(next => { if (!cancelled()) setStatus(next) })
      .catch(() => { if (!cancelled()) setStatus(null) })
      .finally(() => { if (!cancelled()) setProbing(false) })
  }, [api, cwd])

  useEffect(() => {
    // 切换工作区后旧仓库的结果必须丢弃，否则会显示上一个仓库的通道状态。
    let stale = false
    probe(() => stale)
    return () => { stale = true }
  }, [probe])

  return {
    status,
    probing: probing || switching,
    switching,
    reprobe: () => { probe(() => false) },
    useSsh: () => {
      if (cwd === undefined) return
      setSwitching(true)
      api.switchRemote(cwd, 'ssh')
        .then(async () => { await refresh() })
        .catch(() => undefined)
        .finally(() => { setSwitching(false); probe(() => false) })
    },
  }
}
