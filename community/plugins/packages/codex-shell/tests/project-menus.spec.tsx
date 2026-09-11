// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectCreateModal } from '../src/client/sidebar/project/create-modal.js'
import { ProjectMenuBody } from '../src/client/sidebar/project/menu.js'
import { zh } from '../src/client/locales.js'
import type { FsListResponse } from 'dsh-codex-shell/types'
import type { WorkspaceViewLike } from '../src/client/faces.js'

const t = (key: string, params?: Record<string, unknown>): string => {
  const raw = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

const fsList = async (): Promise<FsListResponse> => ({ entries: [] } as unknown as FsListResponse)

const workspaces: readonly WorkspaceViewLike[] = [
  { workspaceId: 'w1', title: 'alpha', path: 'D:\\work\\alpha', sessionIds: [] },
  { workspaceId: 'w2', title: 'beta', path: 'D:\\work\\beta', sessionIds: [] },
]

afterEach(cleanup)

describe('ProjectCreateModal', () => {
  it('默认以第一个工作区为基本盘，创建时先确保工作区再建项目', async () => {
    const createWorkspace = vi.fn(async (input: { path: string }) => ({ workspaceId: 'w1', path: input.path }))
    const createProject = vi.fn(async (name: string, roots?: readonly string[]) => ({
      project: { projectId: 'p1', name, roots: roots ?? [], createdAt: '', updatedAt: '' },
    }))
    const onCreated = vi.fn()
    const onClose = vi.fn()
    render(
      <ProjectCreateModal
        open
        workspaces={workspaces}
        fsList={fsList}
        createWorkspace={createWorkspace}
        createProject={createProject}
        onCreated={onCreated}
        onClose={onClose}
        t={t}
      />,
    )
    // 默认项目名取基本盘目录名。
    expect((screen.getByPlaceholderText('新项目名称') as HTMLInputElement).value).toBe('alpha')
    fireEvent.click(screen.getByText('创建'))
    await screen.findByRole('dialog')
    expect(createWorkspace).toHaveBeenCalledWith({ path: 'D:\\work\\alpha' })
    expect(createProject).toHaveBeenCalledWith('alpha', ['D:\\work\\alpha'])
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('可切换基本盘工作区，并按所选工作区建项目', async () => {
    const createWorkspace = vi.fn(async (input: { path: string }) => ({ workspaceId: 'w2', path: input.path }))
    const createProject = vi.fn(async (name: string, roots?: readonly string[]) => ({
      project: { projectId: 'p1', name, roots: roots ?? [], createdAt: '', updatedAt: '' },
    }))
    render(
      <ProjectCreateModal
        open
        workspaces={workspaces}
        fsList={fsList}
        createWorkspace={createWorkspace}
        createProject={createProject}
        onCreated={vi.fn()}
        onClose={vi.fn()}
        t={t}
      />,
    )
    fireEvent.click(screen.getByText('beta'))
    fireEvent.click(screen.getByText('创建'))
    await screen.findByRole('dialog')
    expect(createWorkspace).toHaveBeenCalledWith({ path: 'D:\\work\\beta' })
    expect(createProject).toHaveBeenCalledWith('beta', ['D:\\work\\beta'])
  })
})

describe('ProjectMenuBody', () => {
  it('派发重命名 / 管理工作树 / 归档组内会话 / 删除项目', () => {
    const actions = {
      rename: vi.fn(),
      manageWorktrees: vi.fn(),
      archiveAllSessions: vi.fn(),
      deleteProject: vi.fn(),
    }
    render(<ProjectMenuBody actions={actions} name="alpha" t={t} />)
    expect(screen.getByText('alpha')).toBeTruthy()
    fireEvent.click(screen.getByText('重命名项目'))
    fireEvent.click(screen.getByText('管理工作树…'))
    fireEvent.click(screen.getByText('归档该组会话'))
    fireEvent.click(screen.getByText('删除项目'))
    expect(actions.rename).toHaveBeenCalledTimes(1)
    expect(actions.manageWorktrees).toHaveBeenCalledTimes(1)
    expect(actions.archiveAllSessions).toHaveBeenCalledTimes(1)
    expect(actions.deleteProject).toHaveBeenCalledTimes(1)
  })
})
