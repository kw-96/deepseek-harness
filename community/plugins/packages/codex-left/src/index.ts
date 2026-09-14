/** Host service for the dsh-codex-left Codex-style project/session navigation rail. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { listDirectory } from './host/fsops.js'
import type {
  FsListResponse,
  ProjectCreateRequest, ProjectDeleteRequest, ProjectDeleteResponse,
  ProjectListResponse, ProjectRenameRequest, ProjectSetRootsRequest, ProjectValue, ProjectView,
} from './types.js'

export type * from './types.js'

/** Structural face of `ctx.workspaceRegistry` project tier (avoids full import). */
interface ProjectEntityLike {
  readonly id: unknown
  readonly name: string
  readonly roots: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  setName(name: string): Promise<void>
  setRoots(roots: readonly string[]): Promise<void>
}

interface ProjectRegistryFace {
  listProjects(): Array<ProjectEntityLike>
  getProject(id: string): ProjectEntityLike | undefined
  createProject(name: string, roots: readonly string[]): Promise<ProjectEntityLike>
  deleteProject(id: string): Promise<boolean>
}

/** codexLeft Remote: directory listing for the pickers and the project registry. */
export class CodexLeft extends TypertRemoteService {
  static inject = ['fs', 'workspaceRegistry']

  constructor(ctx: Context) {
    super(ctx, 'codexLeft')
  }

  private projectRegistry(): ProjectRegistryFace {
    const registry = this.ctx.get('workspaceRegistry') as ProjectRegistryFace | undefined
    if (registry === undefined) throw new Error('工作区注册表未挂载')
    return registry
  }

  @Remote('fsList')
  async fsList(path: string): Promise<FsListResponse> {
    return await listDirectory(this.ctx.fs, path)
  }

  @Remote('projectList')
  projectList(): Promise<ProjectListResponse> {
    return Promise.resolve({
      projects: this.projectRegistry().listProjects().map(projectView),
    })
  }

  @Remote('projectCreate')
  async projectCreate(request: ProjectCreateRequest): Promise<ProjectValue> {
    const name = request.name.trim()
    if (name === '') throw new Error('项目名称不能为空')
    return { project: projectView(await this.projectRegistry().createProject(name, request.roots ?? [])) }
  }

  @Remote('projectRename')
  async projectRename(request: ProjectRenameRequest): Promise<ProjectValue> {
    const project = this.projectRegistry().getProject(request.projectId)
    if (project === undefined) throw new Error(`未知项目 ${request.projectId}`)
    const name = request.name.trim()
    if (name === '') throw new Error('项目名称不能为空')
    await project.setName(name)
    return { project: projectView(project) }
  }

  @Remote('projectSetRoots')
  async projectSetRoots(request: ProjectSetRootsRequest): Promise<ProjectValue> {
    const project = this.projectRegistry().getProject(request.projectId)
    if (project === undefined) throw new Error(`未知项目 ${request.projectId}`)
    await project.setRoots(request.roots)
    return { project: projectView(project) }
  }

  @Remote('projectDelete')
  async projectDelete(request: ProjectDeleteRequest): Promise<ProjectDeleteResponse> {
    return { deleted: await this.projectRegistry().deleteProject(request.projectId) }
  }
}

/** Project one registry entity into its Remote value. */
function projectView(project: ProjectEntityLike): ProjectView {
  return {
    projectId: String(project.id),
    name: project.name,
    roots: [...project.roots],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

export default CodexLeft
