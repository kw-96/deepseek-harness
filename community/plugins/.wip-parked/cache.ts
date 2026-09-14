/**
 * 面板数据的跨会话缓存：同一个工作区只读一次。
 *
 * 右栏的开合状态本来就按会话保存（宿主 `bySession[sessionId].layout.expanded`），
 * 但面板组件在切换会话时会重新挂载，数据随之丢弃——同一个仓库换个会话再看就被
 * 迫整份重读。这里按工作目录缓存最后一次成功读取的结果，并记住它属于哪个仓库根，
 * 使「同仓库不同子目录的会话」也能复用同一份数据。
 *
 * 缓存只在浏览器会话内有效，且不承担正确性：会话内的文件变更仍由变更流失时刷新，
 * 用户也可以随时点刷新按钮。
 */

import type { GitIdentity, GitLogResponse, GitStatusResponse, GithubStatus } from '../../types.js'

/** 面板一次完整读取的结果。 */
export interface CachedPanel {
  status: GitStatusResponse
  log: GitLogResponse
  identity: GitIdentity
  github: GithubStatus
}

interface Entry {
  /** 本次读取得到的仓库根；不在仓库内时为 null。 */
  root: string | null
  panel: CachedPanel
}

/** 工作目录 → 最近一次读取结果。 */
const byCwd = new Map<string, Entry>()

/**
 * 读取某个工作目录的缓存：先按目录精确命中，再按已知的仓库根命中
 * （同一仓库的不同子目录共用一份）。
 * @param cwd - 会话工作目录；未知时为 undefined。
 * @returns 命中的面板数据，未命中时为 undefined。
 */
export function readCachedPanel(cwd: string | undefined): CachedPanel | undefined {
  if (cwd === undefined) return undefined
  const exact = byCwd.get(cwd)
  if (exact !== undefined) return exact.panel
  const root = rootOf(cwd)
  if (root === null) return undefined
  for (const entry of byCwd.values()) {
    if (entry.root !== null && entry.root === root) return entry.panel
  }
  return undefined
}

/** 某个工作目录所属的仓库根（来自此前读取到的事实）。 */
function rootOf(cwd: string): string | null {
  for (const entry of byCwd.values()) {
    if (entry.root === null || entry.panel.status.root === null) continue
    const root = entry.panel.status.root
    if (cwd === root || cwd.startsWith(`${root}\\`) || cwd.startsWith(`${root}/`)) return root
  }
  return null
}

/**
 * 记录一次成功读取。
 * @param cwd - 会话工作目录。
 * @param panel - 本次读取到的面板数据。
 */
export function writeCachedPanel(cwd: string | undefined, panel: CachedPanel): void {
  if (cwd === undefined) return
  byCwd.set(cwd, { root: panel.status.root, panel })
}

/** 清空缓存（测试用）。 */
export function clearCachedPanels(): void {
  byCwd.clear()
}
