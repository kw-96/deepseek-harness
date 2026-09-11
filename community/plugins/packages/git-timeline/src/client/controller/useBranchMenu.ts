/** 分支切换器的状态与动作（底部栏消费）。 */

import { useCallback, useState } from 'react'
import { loadBranches } from './details.js'
import { runCheckout, runCreateBranch } from './actions.js'
import type { GitPanelApi, TFn } from '../lib/faces.js'

export interface BranchMenuState {
  branchMenuOpen: boolean
  branchNames: readonly string[]
  toggleBranchMenu: () => void
  closeBranchMenu: () => void
  checkoutBranch: (branch: string) => void
  createBranch: (name: string) => void
}

/**
 * 组装底部栏的分支切换器。
 * @param options 工作目录、注入的 git 面、动作执行器与错误上报
 * @returns 分支菜单的状态与回调
 */
export function useBranchMenu(options: {
  cwd: string | undefined
  api: GitPanelApi
  t: TFn
  run: (operation: () => Promise<string>) => Promise<void>
  onError: (message: string) => void
}): BranchMenuState {
  const { cwd, api, t, run, onError } = options
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const [branchNames, setBranchNames] = useState<readonly string[]>([])

  /** 打开时惰性拉取分支列表；再次点击收起。 */
  const toggleBranchMenu = useCallback((): void => {
    const next = !branchMenuOpen
    setBranchMenuOpen(next)
    if (!next || cwd === undefined) return
    void loadBranches(api, cwd).then(result => {
      setBranchNames(result.names)
      if (result.error !== null) onError(result.error)
    })
  }, [api, branchMenuOpen, cwd, onError])

  return {
    branchMenuOpen,
    branchNames,
    toggleBranchMenu,
    closeBranchMenu: () => { setBranchMenuOpen(false) },
    checkoutBranch: (branch) => {
      setBranchMenuOpen(false)
      void run(async () => await runCheckout({ api, cwd: cwd ?? '', t }, branch))
    },
    createBranch: (name) => {
      setBranchMenuOpen(false)
      void run(async () => await runCreateBranch({ api, cwd: cwd ?? '', t }, name))
    },
  }
}
