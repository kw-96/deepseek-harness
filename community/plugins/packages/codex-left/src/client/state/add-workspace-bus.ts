/**
 * 添加工作区弹窗触发总线：标题栏「+」与桌面标题栏命令共用同一打开器。
 */

type Opener = () => void

let opener: Opener | null = null

/** 注册打开器（AddWorkspaceAction 挂载时调用）。 */
export function registerAddWorkspaceOpener(next: Opener | null): void {
  opener = next
}

/** 请求打开添加工作区弹窗；未注册时无操作。 */
export function requestAddWorkspaceOpen(): void {
  opener?.()
}
