import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type {
  FsContentSearchResponse, FsListResponse, FsNameSearchResponse, FsReadResponse, FsSearchOptions, FsWriteResponse,
  GitBranchesResponse, GitCheckoutResponse, GitCommitResponse, GitDiffResponse, GitLogResponse,
  GitSimpleResponse, GitStatusResponse, ProjectAddDirResponse, ProjectCreateRequest, ProjectDeleteRequest,
  ProjectDeleteResponse, ProjectDirsResponse, ProjectListResponse, ProjectRenameRequest, ProjectSetDirsResponse,
  ProjectSetRootsRequest, ProjectValue,
  TerminalFollowFrame, TerminalListResponse, TerminalOpenOptions, TerminalOpenResponse, TerminalReadResponse,
  TerminalResizeResponse, TerminalSendResponse, TerminalWriteResponse,
} from './types.js'
import {
  codexOk, fsContentSearchValue, fsListValue, fsNameSearchValue, fsReadValue, fsSearchOptions,
  gitBranchValue, gitLogValue, gitStatusValue, projectAddValue, projectDeleteValue, projectDirsValue, projectListValue,
  projectValue,
  terminalFollowValue, terminalListValue, terminalOkValue, terminalOpenOptions, terminalOpenValue,
  terminalReadValue, terminalSendValue,
} from './types.js'

const strict = (typeSymbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol, schema })
const parameter = (name: string, schema: z.ZodType) => ({
  name, wire: name, source: 'json' as const, codec: strict(`dsh-codex-shell/types#${name}`, schema),
})
const descriptor = (method: string, parameters: readonly ReturnType<typeof parameter>[], result: z.ZodType, type: string) => ({
  id: `dsh-codex-shell#codexShell/${method}`,
  service: 'codexShell', namespace: 'codexShell', method, invocation: { kind: 'direct' as const }, parameters,
  result: strict(`dsh-codex-shell/types#${type}`, result),
})
const streamDescriptor = (
  method: string,
  parameters: readonly ReturnType<typeof parameter>[],
  result: z.ZodType,
  type: string,
) => ({
  ...descriptor(method, parameters, result, type),
  mode: 'stream' as const,
  cancellation: { parameter: 'signal' as const },
})
const optString = z.string().optional()
const optNumber = z.number().optional()
const optBoolean = z.boolean().optional()

const descriptors = [
  descriptor('fsList', [parameter('path', z.string())], fsListValue, 'FsListResponse'),
  descriptor('fsRead', [parameter('path', z.string()), parameter('maxBytes', optNumber)], fsReadValue, 'FsReadResponse'),
  descriptor('fsWrite', [parameter('path', z.string()), parameter('content', z.string())], codexOk, 'FsWriteResponse'),
  descriptor('fsSearchName', [parameter('root', z.string()), parameter('query', z.string()), parameter('options', fsSearchOptions.optional())], fsNameSearchValue, 'FsNameSearchResponse'),
  descriptor('fsSearchContent', [parameter('root', z.string()), parameter('query', z.string()), parameter('options', fsSearchOptions.optional())], fsContentSearchValue, 'FsContentSearchResponse'),
  descriptor('gitStatus', [parameter('cwd', z.string())], gitStatusValue, 'GitStatusResponse'),
  descriptor('gitLog', [parameter('cwd', z.string()), parameter('count', optNumber)], gitLogValue, 'GitLogResponse'),
  descriptor('gitDiff', [parameter('cwd', z.string()), parameter('path', optString), parameter('staged', optBoolean)], z.object({ text: z.string() }).readonly(), 'GitDiffResponse'),
  descriptor('gitStage', [parameter('cwd', z.string()), parameter('path', optString)], codexOk, 'GitSimpleResponse'),
  descriptor('gitUnstage', [parameter('cwd', z.string()), parameter('path', optString)], codexOk, 'GitSimpleResponse'),
  descriptor('gitDiscard', [parameter('cwd', z.string()), parameter('path', z.string())], codexOk, 'GitSimpleResponse'),
  descriptor('gitCommit', [parameter('cwd', z.string()), parameter('message', z.string())], codexOk, 'GitCommitResponse'),
  descriptor('gitBranches', [parameter('cwd', z.string())], gitBranchValue, 'GitBranchesResponse'),
  descriptor('gitCheckout', [parameter('cwd', z.string()), parameter('branch', z.string())], codexOk, 'GitCheckoutResponse'),
  descriptor('gitFetch', [parameter('cwd', z.string())], codexOk, 'GitSimpleResponse'),
  descriptor('gitPull', [parameter('cwd', z.string())], codexOk, 'GitSimpleResponse'),
  descriptor('gitPush', [parameter('cwd', z.string())], codexOk, 'GitSimpleResponse'),
  descriptor('gitStageAll', [parameter('cwd', z.string())], codexOk, 'GitSimpleResponse'),
  descriptor('gitUnstageAll', [parameter('cwd', z.string())], codexOk, 'GitSimpleResponse'),
  descriptor('terminalOpen', [
    parameter('sessionId', z.string()),
    parameter('options', terminalOpenOptions.optional()),
  ], terminalOpenValue, 'TerminalOpenResponse'),
  descriptor('terminalList', [parameter('sessionId', z.string())], terminalListValue, 'TerminalListResponse'),
  descriptor('terminalSend', [parameter('sessionId', z.string()), parameter('terminalId', z.string()), parameter('text', z.string())], terminalSendValue, 'TerminalSendResponse'),
  streamDescriptor('terminalFollow', [parameter('sessionId', z.string()), parameter('terminalId', z.string())], terminalFollowValue, 'TerminalFollowFrame'),
  descriptor('terminalWrite', [parameter('sessionId', z.string()), parameter('terminalId', z.string()), parameter('data', z.string())], terminalOkValue, 'TerminalWriteResponse'),
  descriptor('terminalResize', [
    parameter('sessionId', z.string()),
    parameter('terminalId', z.string()),
    parameter('cols', z.number()),
    parameter('rows', z.number()),
  ], terminalOkValue, 'TerminalResizeResponse'),
  descriptor('terminalRead', [parameter('sessionId', z.string()), parameter('terminalId', z.string())], terminalReadValue, 'TerminalReadResponse'),
  descriptor('terminalClose', [parameter('sessionId', z.string()), parameter('terminalId', z.string())], codexOk, 'GitSimpleResponse'),
  descriptor('projectDirs', [parameter('workspaceId', z.string())], projectDirsValue, 'ProjectDirsResponse'),
  descriptor('projectSetDirs', [parameter('workspaceId', z.string()), parameter('dirs', z.array(z.string()))], projectDirsValue, 'ProjectSetDirsResponse'),
  descriptor('projectAddDir', [parameter('workspaceId', z.string()), parameter('path', z.string())], projectAddValue, 'ProjectAddDirResponse'),
  descriptor('projectList', [], projectListValue, 'ProjectListResponse'),
  descriptor('projectCreate', [parameter('request', z.object({ name: z.string(), roots: z.array(z.string()).optional() }))], projectValue, 'ProjectValue'),
  descriptor('projectRename', [parameter('request', z.object({ projectId: z.string(), name: z.string() }))], projectValue, 'ProjectValue'),
  descriptor('projectSetRoots', [parameter('request', z.object({ projectId: z.string(), roots: z.array(z.string()) }))], projectValue, 'ProjectValue'),
  descriptor('projectDelete', [parameter('request', z.object({ projectId: z.string() }))], projectDeleteValue, 'ProjectDeleteResponse'),
] as const

export const TYPERT_REMOTE: TypertRemoteContribution = { package: 'dsh-codex-shell', descriptors }
export const TYPERT = {
  package: 'dsh-codex-shell', face: 'host', schemas: [], invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'codexShell/fsList': (path: string) => Promise<RemoteResult<FsListResponse>>
    'codexShell/fsRead': (path: string, maxBytes?: number) => Promise<RemoteResult<FsReadResponse>>
    'codexShell/fsWrite': (path: string, content: string) => Promise<RemoteResult<FsWriteResponse>>
    'codexShell/fsSearchName': (root: string, query: string, options?: FsSearchOptions) => Promise<RemoteResult<FsNameSearchResponse>>
    'codexShell/fsSearchContent': (root: string, query: string, options?: FsSearchOptions) => Promise<RemoteResult<FsContentSearchResponse>>
    'codexShell/gitStatus': (cwd: string) => Promise<RemoteResult<GitStatusResponse>>
    'codexShell/gitLog': (cwd: string, count?: number) => Promise<RemoteResult<GitLogResponse>>
    'codexShell/gitDiff': (cwd: string, path?: string, staged?: boolean) => Promise<RemoteResult<GitDiffResponse>>
    'codexShell/gitStage': (cwd: string, path?: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/gitUnstage': (cwd: string, path?: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/gitDiscard': (cwd: string, path: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/gitCommit': (cwd: string, message: string) => Promise<RemoteResult<GitCommitResponse>>
    'codexShell/gitBranches': (cwd: string) => Promise<RemoteResult<GitBranchesResponse>>
    'codexShell/gitCheckout': (cwd: string, branch: string) => Promise<RemoteResult<GitCheckoutResponse>>
    'codexShell/gitFetch': (cwd: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/gitPull': (cwd: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/gitPush': (cwd: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/gitStageAll': (cwd: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/gitUnstageAll': (cwd: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/terminalOpen': (sessionId: string, options?: TerminalOpenOptions) => Promise<RemoteResult<TerminalOpenResponse>>
    'codexShell/terminalList': (sessionId: string) => Promise<RemoteResult<TerminalListResponse>>
    'codexShell/terminalSend': (sessionId: string, terminalId: string, text: string) => Promise<RemoteResult<TerminalSendResponse>>
    'codexShell/terminalFollow': (sessionId: string, terminalId: string, signal?: AbortSignal) => AsyncIterable<TerminalFollowFrame>
    'codexShell/terminalWrite': (sessionId: string, terminalId: string, data: string) => Promise<RemoteResult<TerminalWriteResponse>>
    'codexShell/terminalResize': (sessionId: string, terminalId: string, cols: number, rows: number) => Promise<RemoteResult<TerminalResizeResponse>>
    'codexShell/terminalRead': (sessionId: string, terminalId: string) => Promise<RemoteResult<TerminalReadResponse>>
    'codexShell/terminalClose': (sessionId: string, terminalId: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/projectDirs': (workspaceId: string) => Promise<RemoteResult<ProjectDirsResponse>>
    'codexShell/projectSetDirs': (workspaceId: string, dirs: readonly string[]) => Promise<RemoteResult<ProjectSetDirsResponse>>
    'codexShell/projectAddDir': (workspaceId: string, path: string) => Promise<RemoteResult<ProjectAddDirResponse>>
    'codexShell/projectList': () => Promise<RemoteResult<ProjectListResponse>>
    'codexShell/projectCreate': (request: ProjectCreateRequest) => Promise<RemoteResult<ProjectValue>>
    'codexShell/projectRename': (request: ProjectRenameRequest) => Promise<RemoteResult<ProjectValue>>
    'codexShell/projectSetRoots': (request: ProjectSetRootsRequest) => Promise<RemoteResult<ProjectValue>>
    'codexShell/projectDelete': (request: ProjectDeleteRequest) => Promise<RemoteResult<ProjectDeleteResponse>>
  }
  interface TypertRemoteNamespaceMap {
    codexShell: {
      fsList: (path: string) => Promise<RemoteResult<FsListResponse>>
      fsRead: (path: string, maxBytes?: number) => Promise<RemoteResult<FsReadResponse>>
      fsWrite: (path: string, content: string) => Promise<RemoteResult<FsWriteResponse>>
      fsSearchName: (root: string, query: string, options?: FsSearchOptions) => Promise<RemoteResult<FsNameSearchResponse>>
      fsSearchContent: (root: string, query: string, options?: FsSearchOptions) => Promise<RemoteResult<FsContentSearchResponse>>
      gitStatus: (cwd: string) => Promise<RemoteResult<GitStatusResponse>>
      gitLog: (cwd: string, count?: number) => Promise<RemoteResult<GitLogResponse>>
      gitDiff: (cwd: string, path?: string, staged?: boolean) => Promise<RemoteResult<GitDiffResponse>>
      gitStage: (cwd: string, path?: string) => Promise<RemoteResult<GitSimpleResponse>>
      gitUnstage: (cwd: string, path?: string) => Promise<RemoteResult<GitSimpleResponse>>
      gitDiscard: (cwd: string, path: string) => Promise<RemoteResult<GitSimpleResponse>>
      gitCommit: (cwd: string, message: string) => Promise<RemoteResult<GitCommitResponse>>
      gitBranches: (cwd: string) => Promise<RemoteResult<GitBranchesResponse>>
      gitCheckout: (cwd: string, branch: string) => Promise<RemoteResult<GitCheckoutResponse>>
      gitFetch: (cwd: string) => Promise<RemoteResult<GitSimpleResponse>>
      gitPull: (cwd: string) => Promise<RemoteResult<GitSimpleResponse>>
      gitPush: (cwd: string) => Promise<RemoteResult<GitSimpleResponse>>
      gitStageAll: (cwd: string) => Promise<RemoteResult<GitSimpleResponse>>
      gitUnstageAll: (cwd: string) => Promise<RemoteResult<GitSimpleResponse>>
      terminalOpen: (sessionId: string, options?: TerminalOpenOptions) => Promise<RemoteResult<TerminalOpenResponse>>
      terminalList: (sessionId: string) => Promise<RemoteResult<TerminalListResponse>>
      terminalSend: (sessionId: string, terminalId: string, text: string) => Promise<RemoteResult<TerminalSendResponse>>
      terminalFollow: (sessionId: string, terminalId: string, signal?: AbortSignal) => AsyncIterable<TerminalFollowFrame>
      terminalWrite: (sessionId: string, terminalId: string, data: string) => Promise<RemoteResult<TerminalWriteResponse>>
      terminalResize: (sessionId: string, terminalId: string, cols: number, rows: number) => Promise<RemoteResult<TerminalResizeResponse>>
      terminalRead: (sessionId: string, terminalId: string) => Promise<RemoteResult<TerminalReadResponse>>
      terminalClose: (sessionId: string, terminalId: string) => Promise<RemoteResult<GitSimpleResponse>>
      projectDirs: (workspaceId: string) => Promise<RemoteResult<ProjectDirsResponse>>
      projectSetDirs: (workspaceId: string, dirs: readonly string[]) => Promise<RemoteResult<ProjectSetDirsResponse>>
      projectAddDir: (workspaceId: string, path: string) => Promise<RemoteResult<ProjectAddDirResponse>>
      projectList: () => Promise<RemoteResult<ProjectListResponse>>
      projectCreate: (request: ProjectCreateRequest) => Promise<RemoteResult<ProjectValue>>
      projectRename: (request: ProjectRenameRequest) => Promise<RemoteResult<ProjectValue>>
      projectSetRoots: (request: ProjectSetRootsRequest) => Promise<RemoteResult<ProjectValue>>
      projectDelete: (request: ProjectDeleteRequest) => Promise<RemoteResult<ProjectDeleteResponse>>
    }
  }
}

export default TYPERT_REMOTE
