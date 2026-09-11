/**
 * 新建会话页的项目选择器（遮蔽宿主 `conversation.hero.workspace`）：
 * 列出项目（置顶 → 最近 → 其余）与未分组工作区，并提供「新建项目…」。
 * 选中项目时：单工作区直接开会话；多工作区先展开工作树让用户选一个；
 * 没有归属工作区的项目禁用并说明原因。
 */

import { useEffect, useMemo, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Folder, FolderPlus } from 'lucide-react'
import type { FsListResponse, ProjectView } from 'dsh-codex-shell/types'
import type { SelectorHook, SessionListStateLike, TFn, WorkspaceSnapshotLike, WorkspaceViewLike } from '../faces.js'
import type { BrowserPrefsStore } from '../sidebar/prefs.js'
import { orderProjects, projectForPath } from '../sidebar/groups.js'
import { MenuSep } from '../sidebar/menu-flyout.js'
import { ProjectCreateModal } from '../sidebar/project/create-modal.js'
import css from '../styles.module.css'

export interface ProjectPickerInjected {
  listProjects: () => Promise<{ projects: readonly ProjectView[] }>
  prefs: BrowserPrefsStore
  createWorkspace: (input: { path: string }) => Promise<{ workspaceId: string; path: string }>
  createProject: (name: string, roots?: readonly string[]) => Promise<{ project: ProjectView }>
  fsList: (path: string) => Promise<FsListResponse>
}

export interface ProjectPickerProps extends ProjectPickerInjected {
  /** 宿主 hero 的弹出开关（点击工作区 chip 切换）。 */
  open: boolean
  /** chip 元素：弹层的定位锚点。 */
  anchorRef?: RefObject<HTMLElement | null> | undefined
  /** 宿主已选中的工作区（列表打勾）。 */
  selectedId?: string | undefined
  onPick: (workspaceId: string) => void
  onClose: () => void
  useWorkspaces: SelectorHook<WorkspaceSnapshotLike>
  useSessions: SelectorHook<SessionListStateLike>
  t: TFn
}

/** 渲染项目选择弹层（含工作树二级选择与新建项目入口）。 */
export function ProjectPicker(props: ProjectPickerProps) {
  const {
    open, anchorRef, selectedId, onPick, onClose, prefs, t,
    listProjects, createWorkspace, createProject, fsList, useWorkspaces, useSessions,
  } = props
  const workspaces = useWorkspaces(state => state.items)
  const sessions = useSessions(state => state)
  const [projects, setProjects] = useState<readonly ProjectView[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!open) return
    void listProjects().then(result => { setProjects(result.projects) }).catch(() => { /* 读取失败保持空列表 */ })
  }, [listProjects, open])

  // 打开时按锚点定位；滚动/缩放时跟随。
  useEffect(() => {
    if (!open) { setAnchor(null); return }
    const place = (): void => {
      const rect = anchorRef?.current?.getBoundingClientRect()
      if (rect === undefined) return
      setAnchor({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)), top: rect.bottom + 6 })
    }
    place()
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
    }
  }, [anchorRef, open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (anchorRef?.current?.contains(target) === true) return
      if (target instanceof Element && target.closest('[data-codex-hero-menu]') !== null) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchorRef, onClose, open])

  /** 项目最近活动＝项目下会话的最大 updatedAt（无会话回退注册表 updatedAt）。 */
  const recency = useMemo(() => {
    const byProject = new Map<string, number>()
    for (const project of projects) {
      let latest = 0
      for (const session of Object.values(sessions.byId)) {
        if (session.cwd === undefined || session.cwd === '') continue
        if (projectForPath(session.cwd, [project]) === undefined) continue
        if (session.updatedAt > latest) latest = session.updatedAt
      }
      byProject.set(project.projectId, latest)
    }
    return (projectId: string): number => byProject.get(projectId) ?? 0
  }, [projects, sessions.byId])

  const ordered = useMemo(
    () => orderProjects(projects, prefs, recency),
    [prefs, projects, recency],
  )
  const workspacesOf = (project: ProjectView): WorkspaceViewLike[] =>
    workspaces.filter(ws => projectForPath(ws.path, [project]) !== undefined)
  const ungrouped = workspaces.filter(ws => projectForPath(ws.path, projects) === undefined)

  const chooseProject = (project: ProjectView): void => {
    const owned = workspacesOf(project)
    if (owned.length === 0) return
    if (owned.length === 1) {
      onPick(owned[0]!.workspaceId)
      onClose()
      return
    }
    setExpanded(current => current === project.projectId ? null : project.projectId)
  }

  if (!open) return null

  const menu = anchor === null ? null : (
    <div
      data-codex-hero-menu=""
      className={`${css.menu} ${css.menuScrollable}`}
      style={{ left: anchor.left, top: anchor.top }}
      role="menu"
    >
      <div className={css.menuGroupLabel}>{t('projectsSection')}</div>
      {ordered.map((project) => {
        const owned = workspacesOf(project)
        return (
          <div key={project.projectId}>
            <button
              type="button"
              className={css.menuItem}
              disabled={owned.length === 0}
              title={owned.length === 0 ? t('newProjectNoWorkspace') : project.name}
              onClick={() => { chooseProject(project) }}
            >
              <Folder size={13} />
              <span className={css.rowLabel}>{project.name}</span>
            </button>
            {expanded === project.projectId && owned.map(ws => (
              <button
                key={ws.workspaceId}
                type="button"
                className={css.menuItem}
                onClick={() => { onPick(ws.workspaceId); onClose() }}
              >
                <span className={css.rowLabel} title={ws.path}>{ws.title}</span>
              </button>
            ))}
          </div>
        )
      })}
      {ungrouped.length > 0 && (
        <>
          <div className={css.menuGroupLabel}>{t('ungrouped')}</div>
          {ungrouped.map(ws => (
            <button
              key={ws.workspaceId}
              type="button"
              className={css.menuItem}
              data-selected={ws.workspaceId === selectedId ? '' : undefined}
              onClick={() => { onPick(ws.workspaceId); onClose() }}
            >
              <span className={css.rowLabel} title={ws.path}>{ws.title}</span>
            </button>
          ))}
        </>
      )}
      <MenuSep />
      <button
        type="button"
        className={css.menuItem}
        onClick={() => { setCreating(true); onClose() }}
      >
        <FolderPlus size={13} />
        <span className={css.rowLabel}>{t('addProject')}</span>
      </button>
    </div>
  )

  return (
    <>
      {menu !== null && createPortal(menu, document.body)}
      <ProjectCreateModal
        open={creating}
        workspaces={workspaces}
        fsList={fsList}
        createWorkspace={createWorkspace}
        createProject={createProject}
        onCreated={() => { /* 列表在下次打开时刷新 */ }}
        onClose={() => { setCreating(false) }}
        t={t}
      />
    </>
  )
}
