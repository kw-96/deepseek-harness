import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type {
  FsListResponse, ProjectCreateRequest, ProjectDeleteRequest, ProjectDeleteResponse, ProjectListResponse,
  ProjectRenameRequest, ProjectSetRootsRequest, ProjectValue,
} from './types.js'
import { fsListValue, projectDeleteValue, projectListValue, projectValue } from './types.js'

const strict = (typeSymbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol, schema })
const parameter = (name: string, schema: z.ZodType) => ({
  name, wire: name, source: 'json' as const, codec: strict(`dsh-codex-left/types#${name}`, schema),
})
const descriptor = (method: string, parameters: readonly ReturnType<typeof parameter>[], result: z.ZodType, type: string) => ({
  id: `dsh-codex-left#codexLeft/${method}`,
  service: 'codexLeft', namespace: 'codexLeft', method, invocation: { kind: 'direct' as const }, parameters,
  result: strict(`dsh-codex-left/types#${type}`, result),
})
const descriptors = [
  descriptor('fsList', [parameter('path', z.string())], fsListValue, 'FsListResponse'),
  descriptor('projectList', [], projectListValue, 'ProjectListResponse'),
  descriptor('projectCreate', [parameter('request', z.object({ name: z.string(), roots: z.array(z.string()).optional() }))], projectValue, 'ProjectValue'),
  descriptor('projectRename', [parameter('request', z.object({ projectId: z.string(), name: z.string() }))], projectValue, 'ProjectValue'),
  descriptor('projectSetRoots', [parameter('request', z.object({ projectId: z.string(), roots: z.array(z.string()) }))], projectValue, 'ProjectValue'),
  descriptor('projectDelete', [parameter('request', z.object({ projectId: z.string() }))], projectDeleteValue, 'ProjectDeleteResponse'),
] as const

export const TYPERT_REMOTE: TypertRemoteContribution = { package: 'dsh-codex-left', descriptors }
export const TYPERT = {
  package: 'dsh-codex-left', face: 'host', schemas: [], invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'codexLeft/fsList': (path: string) => Promise<RemoteResult<FsListResponse>>
    'codexLeft/projectList': () => Promise<RemoteResult<ProjectListResponse>>
    'codexLeft/projectCreate': (request: ProjectCreateRequest) => Promise<RemoteResult<ProjectValue>>
    'codexLeft/projectRename': (request: ProjectRenameRequest) => Promise<RemoteResult<ProjectValue>>
    'codexLeft/projectSetRoots': (request: ProjectSetRootsRequest) => Promise<RemoteResult<ProjectValue>>
    'codexLeft/projectDelete': (request: ProjectDeleteRequest) => Promise<RemoteResult<ProjectDeleteResponse>>
  }
}

export default TYPERT_REMOTE
