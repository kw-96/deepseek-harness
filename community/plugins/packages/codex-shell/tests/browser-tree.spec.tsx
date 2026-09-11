// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserTree } from '../src/client/browser-tree.js'
import { SessionMetaStore } from '../src/client/session-meta.js'
import { BrowserPrefsStore } from '../src/client/sidebar/prefs.js'
import { zh } from '../src/client/locales.js'
import type { ProjectView, SessionListStateLike, WorkspaceViewLike } from '../src/client/faces.js'

const t = (key: string, params?: Record<string, unknown>): string => {
  const raw = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

const workspace = (path: string): WorkspaceViewLike => ({
  workspaceId: 'w1', title: 'W1', path, sessionIds: [],
})

const project = (roots: readonly string[]): ProjectView => ({
  projectId: 'p1', name: '项目一', roots,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
})

const list: SessionListStateLike = { ids: [], byId: {}, current: undefined, phase: 'ready' }

/** 渲染项目视图（byProject）并返回注入回调。 */
function renderTree(path: string, roots: readonly string[], pinned: boolean) {
  const prefs = new BrowserPrefsStore()
  if (pinned) prefs.setProjectPinned('p1', true)
  const onNewSession = vi.fn()
  const onToggleGroup = vi.fn()
  const onToggleProjectPin = vi.fn()
  render(
    <BrowserTree
      groups={{
        grouped: [{ workspace: workspace(path), sessions: [] }],
        ungrouped: [], archived: [], flat: [],
      }}
      list={list}
      collapsed={new Set()}
      searching={false}
      searchItems={[]}
      searchLoading={false}
      renaming={null}
      renameDraft=""
      organize="byProject"
      sort="pinnedFirst"
      prefs={prefs}
      projects={[project(roots)]}
      onToggleGroup={onToggleGroup}
      onOpen={vi.fn()}
      onWorkspaceMenu={vi.fn()}
      onSessionMenu={vi.fn()}
      onArchiveSession={vi.fn()}
      onToggleWorkspacePin={vi.fn()}
      onToggleProjectPin={onToggleProjectPin}
      onNewSession={onNewSession}
      onBeginWorkspaceRename={vi.fn()}
      setRenameDraft={vi.fn()}
      commitRename={vi.fn()}
      commitWorkspaceRename={vi.fn()}
      onSessionDrop={vi.fn()}
      sessionWorkspaceId={() => undefined}
      meta={new SessionMetaStore()}
      t={t}
    />,
  )
  return { onNewSession, onToggleGroup, onToggleProjectPin }
}

beforeEach(() => { window.localStorage.clear() })

afterEach(cleanup)

describe('项目行动作按钮', () => {
  it('置顶按钮右侧提供新建会话按钮，点击在项目所属工作区开会话且不切换分组', () => {
    const { onNewSession, onToggleGroup } = renderTree('D:\\proj', ['D:\\proj'], true)
    const pin = screen.getByLabelText('取消置顶')
    const newSession = screen.getByLabelText('在项目中新建会话')
    // 新建会话在置顶按钮右侧（文档顺序在后）。
    expect(pin.compareDocumentPosition(newSession) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(newSession)
    expect(onNewSession).toHaveBeenCalledWith('w1')
    expect(onToggleGroup).not.toHaveBeenCalled()
  })

  it('未置顶项目同样提供两个动作按钮（由悬停显露）', () => {
    const { onToggleProjectPin } = renderTree('D:\\proj', ['D:\\proj'], false)
    fireEvent.click(screen.getByLabelText('置顶'))
    expect(onToggleProjectPin).toHaveBeenCalledWith('p1')
    expect(screen.getByLabelText('在项目中新建会话')).toBeTruthy()
  })

  it('项目没有归属工作区时不渲染新建会话按钮', () => {
    renderTree('D:\\other', ['D:\\proj'], true)
    expect(screen.queryByLabelText('在项目中新建会话')).toBeNull()
    expect(screen.getByLabelText('取消置顶')).toBeTruthy()
  })
})
