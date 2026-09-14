/** 新建会话页项目选择器的弹层内容：项目（可展开工作树）、未分组工作区与新建项目入口。 */

import { Folder, FolderPlus } from 'lucide-react'
import type { ProjectView, TFn, WorkspaceViewLike } from '../faces.js'
import { MenuSep } from './menu-flyout.js'
import css from '../styles.module.css'

/** 弹层属性：锚点、已排序项目、工作树解析与选择动作。 */
export interface HeroProjectMenuProps {
  anchor: { left: number; top: number }
  projects: readonly ProjectView[]
  /** 项目归属的工作区列表（为空表示项目还没有工作树）。 */
  workspacesOf: (project: ProjectView) => readonly WorkspaceViewLike[]
  ungrouped: readonly WorkspaceViewLike[]
  /** 已展开工作树的项目 id。 */
  expanded: string | null
  selectedId?: string | undefined
  onChooseProject: (project: ProjectView) => void
  onPick: (workspaceId: string) => void
  onClose: () => void
  onNewProject: () => void
  t: TFn
}

/** 渲染项目选择弹层。 */
export function HeroProjectMenu(props: HeroProjectMenuProps): React.ReactNode {
  const { anchor, projects, workspacesOf, ungrouped, expanded, selectedId, t } = props
  return (
    <div
      data-codex-hero-menu=""
      className={`${css.menu} ${css.menuScrollable}`}
      style={{ left: anchor.left, top: anchor.top }}
      role="menu"
    >
      <div className={css.menuGroupLabel}>{t('projectsSection')}</div>
      {projects.map((project) => {
        const owned = workspacesOf(project)
        return (
          <div key={project.projectId}>
            <button
              type="button"
              className={css.menuItem}
              disabled={owned.length === 0}
              title={owned.length === 0 ? t('newProjectNoWorkspace') : project.name}
              onClick={() => { props.onChooseProject(project) }}
            >
              <Folder size={13} />
              <span className={css.rowLabel}>{project.name}</span>
            </button>
            {expanded === project.projectId && owned.map(ws => (
              <button
                key={ws.workspaceId}
                type="button"
                className={css.menuItem}
                onClick={() => { props.onPick(ws.workspaceId); props.onClose() }}
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
              onClick={() => { props.onPick(ws.workspaceId); props.onClose() }}
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
        onClick={props.onNewProject}
      >
        <FolderPlus size={13} />
        <span className={css.rowLabel}>{t('addProject')}</span>
      </button>
    </div>
  )
}
