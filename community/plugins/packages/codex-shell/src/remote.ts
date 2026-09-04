import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type {
  FsContentSearchResponse, FsListResponse, FsNameSearchResponse, FsReadResponse, FsWriteResponse,
  GitBranchesResponse, GitCheckoutResponse, GitCommitResponse, GitDiffResponse, GitLogResponse,
  GitSimpleResponse, GitStatusResponse, ProjectAddDirResponse, ProjectDirsResponse, ProjectSetDirsResponse,
} from './types.js'
import {
  codexOk, fsContentSearchValue, fsListValue, fsNameSearchValue, fsReadValue,
  gitBranchValue, gitLogValue, gitStatusValue, projectAddValue, projectDirsValue,
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
const optString = z.string().optional()
const optNumber = z.number().optional()
const optBoolean = z.boolean().optional()

const descriptors = [
  descriptor('fsList', [parameter('path', z.string())], fsListValue, 'FsListResponse'),
  descriptor('fsRead', [parameter('path', z.string()), parameter('maxBytes', optNumber)], fsReadValue, 'FsReadResponse'),
  descriptor('fsWrite', [parameter('path', z.string()), parameter('content', z.string())], codexOk, 'FsWriteResponse'),
  descriptor('fsSearchName', [parameter('root', z.string()), parameter('query', z.string())], fsNameSearchValue, 'FsNameSearchResponse'),
  descriptor('fsSearchContent', [parameter('root', z.string()), parameter('query', z.string())], fsContentSearchValue, 'FsContentSearchResponse'),
  descriptor('gitStatus', [parameter('cwd', z.string())], gitStatusValue, 'GitStatusResponse'),
  descriptor('gitLog', [parameter('cwd', z.string()), parameter('count', optNumber)], gitLogValue, 'GitLogResponse'),
  descriptor('gitDiff', [parameter('cwd', z.string()), parameter('path', optString), parameter('staged', optBoolean)], z.object({ text: z.string() }).readonly(), 'GitDiffResponse'),
  descriptor('gitStage', [parameter('cwd', z.string()), parameter('path', optString)], codexOk, 'GitSimpleResponse'),
  descriptor('gitUnstage', [parameter('cwd', z.string()), parameter('path', optString)], codexOk, 'GitSimpleResponse'),
  descriptor('gitDiscard', [parameter('cwd', z.string()), parameter('path', z.string())], codexOk, 'GitSimpleResponse'),
  descriptor('gitCommit', [parameter('cwd', z.string()), parameter('message', z.string())], codexOk, 'GitCommitResponse'),
  descriptor('gitBranches', [parameter('cwd', z.string())], gitBranchValue, 'GitBranchesResponse'),
  descriptor('gitCheckout', [parameter('cwd', z.string()), parameter('branch', z.string())], codexOk, 'GitCheckoutResponse'),
  descriptor('projectDirs', [parameter('workspaceId', z.string())], projectDirsValue, 'ProjectDirsResponse'),
  descriptor('projectSetDirs', [parameter('workspaceId', z.string()), parameter('dirs', z.array(z.string()))], projectDirsValue, 'ProjectSetDirsResponse'),
  descriptor('projectAddDir', [parameter('workspaceId', z.string()), parameter('path', z.string())], projectAddValue, 'ProjectAddDirResponse'),
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
    'codexShell/fsSearchName': (root: string, query: string) => Promise<RemoteResult<FsNameSearchResponse>>
    'codexShell/fsSearchContent': (root: string, query: string) => Promise<RemoteResult<FsContentSearchResponse>>
    'codexShell/gitStatus': (cwd: string) => Promise<RemoteResult<GitStatusResponse>>
    'codexShell/gitLog': (cwd: string, count?: number) => Promise<RemoteResult<GitLogResponse>>
    'codexShell/gitDiff': (cwd: string, path?: string, staged?: boolean) => Promise<RemoteResult<GitDiffResponse>>
    'codexShell/gitStage': (cwd: string, path?: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/gitUnstage': (cwd: string, path?: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/gitDiscard': (cwd: string, path: string) => Promise<RemoteResult<GitSimpleResponse>>
    'codexShell/gitCommit': (cwd: string, message: string) => Promise<RemoteResult<GitCommitResponse>>
    'codexShell/gitBranches': (cwd: string) => Promise<RemoteResult<GitBranchesResponse>>
    'codexShell/gitCheckout': (cwd: string, branch: string) => Promise<RemoteResult<GitCheckoutResponse>>
    'codexShell/projectDirs': (workspaceId: string) => Promise<RemoteResult<ProjectDirsResponse>>
    'codexShell/projectSetDirs': (workspaceId: string, dirs: readonly string[]) => Promise<RemoteResult<ProjectSetDirsResponse>>
    'codexShell/projectAddDir': (workspaceId: string, path: string) => Promise<RemoteResult<ProjectAddDirResponse>>
  }
  interface TypertRemoteNamespaceMap {
    codexShell: {
      fsList: (path: string) => Promise<RemoteResult<FsListResponse>>
      fsRead: (path: string, maxBytes?: number) => Promise<RemoteResult<FsReadResponse>>
      fsWrite: (path: string, content: string) => Promise<RemoteResult<FsWriteResponse>>
      fsSearchName: (root: string, query: string) => Promise<RemoteResult<FsNameSearchResponse>>
      fsSearchContent: (root: string, query: string) => Promise<RemoteResult<FsContentSearchResponse>>
      gitStatus: (cwd: string) => Promise<RemoteResult<GitStatusResponse>>
      gitLog: (cwd: string, count?: number) => Promise<RemoteResult<GitLogResponse>>
      gitDiff: (cwd: string, path?: string, staged?: boolean) => Promise<RemoteResult<GitDiffResponse>>
      gitStage: (cwd: string, path?: string) => Promise<RemoteResult<GitSimpleResponse>>
      gitUnstage: (cwd: string, path?: string) => Promise<RemoteResult<GitSimpleResponse>>
      gitDiscard: (cwd: string, path: string) => Promise<RemoteResult<GitSimpleResponse>>
      gitCommit: (cwd: string, message: string) => Promise<RemoteResult<GitCommitResponse>>
      gitBranches: (cwd: string) => Promise<RemoteResult<GitBranchesResponse>>
      gitCheckout: (cwd: string, branch: string) => Promise<RemoteResult<GitCheckoutResponse>>
      projectDirs: (workspaceId: string) => Promise<RemoteResult<ProjectDirsResponse>>
      projectSetDirs: (workspaceId: string, dirs: readonly string[]) => Promise<RemoteResult<ProjectSetDirsResponse>>
      projectAddDir: (workspaceId: string, path: string) => Promise<RemoteResult<ProjectAddDirResponse>>
    }
  }
}

export default TYPERT_REMOTE
