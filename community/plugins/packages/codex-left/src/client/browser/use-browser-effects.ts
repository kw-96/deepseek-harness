/** 浏览器副作用与局部状态：自动归档扫描、展开后聚焦搜索与会话/工作区重命名。 */

import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SessionId, SessionListStateLike } from '../faces.js'
import type { BrowserPrefsStore } from '../state/prefs.js'

/** 自动归档扫描间隔（30 分钟）：只在浏览器打开时运行，幂等且按已归档集合跳过。 */
const AUTO_ARCHIVE_SWEEP_MS = 30 * 60 * 1000

/** 侧栏展开动画时长：动画结束后再聚焦搜索框。 */
const EXPAND_SLIDE_MS = 300

/**
 * 自动归档：会话超过阈值天数无活动即归档。运行中、当前选中、空白占位、
 * 子代理会话与已归档项都不动；阈值 0 表示关闭。
 * @param input - 会话快照、已归档集合、阈值天数与归档动作。
 */
export function useAutoArchive(input: {
  list: SessionListStateLike
  archivedIds: readonly SessionId[]
  days: number
  archiveSession: (sessionId: SessionId) => Promise<void>
}): void {
  const { archiveSession } = input
  const sweepState = useRef({
    list: input.list, archivedIds: input.archivedIds, days: input.days, current: input.list.current,
  })
  sweepState.current = {
    list: input.list, archivedIds: input.archivedIds, days: input.days, current: input.list.current,
  }
  useEffect(() => {
    const sweep = (): void => {
      const { list, archivedIds, days, current } = sweepState.current
      if (days <= 0) return
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary === undefined || summary.blank || summary.running) continue
        if (summary.origin === 'subagent' || summary.cwd === undefined) continue
        if (id === current || archivedIds.includes(id)) continue
        if (summary.updatedAt >= cutoff) continue
        void archiveSession(id)
      }
    }
    sweep()
    const timer = window.setInterval(sweep, AUTO_ARCHIVE_SWEEP_MS)
    return () => { window.clearInterval(timer) }
  }, [archiveSession])
}

/**
 * 展开侧栏后聚焦搜索框：等壳体滑动结束再聚焦，避免动画期间抢焦点。
 * @param input - 是否宽态、是否处于「展开后待聚焦」、搜索框引用与完成回调。
 */
export function useFocusSearchOnExpand(input: {
  wide: boolean
  pending: boolean
  inputRef: RefObject<HTMLInputElement>
  onDone: () => void
}): void {
  const { wide, pending, inputRef } = input
  const done = useRef(input.onDone)
  done.current = input.onDone
  useEffect(() => {
    if (!(wide && pending)) return
    const timer = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true })
      done.current()
    }, EXPAND_SLIDE_MS)
    return () => { window.clearTimeout(timer) }
  }, [wide, pending, inputRef])
}

/**
 * 分组收起状态（项目/工作区/归档桶）：写入侧栏偏好仓，刷新后保持。
 * @param prefs - 侧栏偏好仓。
 * @returns 当前收起集合与切换动作。
 */
export function useCollapsedGroups(prefs: BrowserPrefsStore): {
  collapsed: ReadonlySet<string>
  toggle: (key: string) => void
} {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => prefs.collapsedGroups())
  const toggle = (key: string): void => {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCollapsed(next)
    prefs.setCollapsedGroups([...next])
  }
  return { collapsed, toggle }
}

/** 会话/工作区重命名的就地编辑状态（工作区以 `ws:` 前缀与会话 id 区分）。 */export interface RenameController {
  renaming: string | null
  renameDraft: string
  setRenameDraft: (value: string) => void
  beginSession: (sessionId: SessionId, title: string) => void
  beginWorkspace: (workspaceId: string, title: string) => void
  commitSession: (sessionId: SessionId) => void
  commitWorkspace: (workspaceId: string) => void
}

/**
 * 重命名控制器。
 * @param input - 会话/工作区重命名动作与关菜单回调。
 * @returns 当前编辑目标、草稿与开始/提交动作。
 */
export function useRename(input: {
  renameSession: (sessionId: SessionId, title: string) => Promise<void>
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
  closeMenu: () => void
}): RenameController {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const commit = (draft: string, apply: (title: string) => Promise<void>): void => {
    setRenaming(null)
    if (draft.trim() === '') return
    apply(draft.trim()).catch(() => { /* 保留旧标题 */ })
  }
  return {
    renaming,
    renameDraft,
    setRenameDraft,
    beginSession: (sessionId, title) => {
      setRenaming(sessionId); setRenameDraft(title); input.closeMenu()
    },
    beginWorkspace: (workspaceId, title) => {
      setRenaming(`ws:${workspaceId}`); setRenameDraft(title); input.closeMenu()
    },
    commitSession: (sessionId) => { commit(renameDraft, title => input.renameSession(sessionId, title)) },
    commitWorkspace: (workspaceId) => { commit(renameDraft, title => input.renameWorkspace(workspaceId, title)) },
  }
}
