/** gitPanel Remote 的 Typert 贡献：描述符 + 线上类型映射。 */

import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type {
  GitActionResponse, GitBranches, GitCommitDetail, GitCommitResponse, GitDiffResponse, GitIdentity, GitLogResponse,
  GitMessageResponse, GitMessageText, GitStatusResponse,
} from './types.js'
import {
  gitActionValue, gitBranchesValue, gitCommitDetailValue, gitCommitResultValue, gitDiffValue, gitIdentityValue,
  gitLogValue, gitMessageTextValue, gitMessageValue, gitStatusValue,
} from './types.js'

const strict = (typeSymbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol, schema })
const parameter = (name: string, schema: z.ZodType) => ({
  name, wire: name, source: 'json' as const, codec: strict(`dsh-git-timeline/types#${name}`, schema),
})
/**
 * 可省参数必须显式声明 `acceptsUndefined`：网关默认要求每个 JSON 参数都出现在
 * args 里，而 `undefined` 在序列化时会被丢掉——不声明就会报
 * `args fields do not match the descriptor: missing "<name>"`。
 */
const optionalParameter = (name: string, schema: z.ZodType) => ({
  ...parameter(name, schema),
  acceptsUndefined: true as const,
})
const descriptor = (method: string, parameters: readonly ReturnType<typeof parameter>[], result: z.ZodType, type: string) => ({
  id: `dsh-git-timeline#gitPanel/${method}`,
  service: 'gitPanel', namespace: 'gitPanel', method, invocation: { kind: 'direct' as const }, parameters,
  result: strict(`dsh-git-timeline/types#${type}`, result),
})

const pathList = z.array(z.string())
const descriptors = [
  descriptor('status', [parameter('cwd', z.string())], gitStatusValue, 'GitStatusResponse'),
  descriptor('log', [parameter('cwd', z.string()), optionalParameter('limit', z.number())], gitLogValue, 'GitLogResponse'),
  descriptor('diff', [
    parameter('cwd', z.string()), parameter('path', z.string()), parameter('staged', z.boolean()),
  ], gitDiffValue, 'GitDiffResponse'),
  descriptor('show', [parameter('cwd', z.string()), parameter('hash', z.string())], gitCommitDetailValue, 'GitCommitDetail'),
  descriptor('showFile', [
    parameter('cwd', z.string()), parameter('hash', z.string()), parameter('path', z.string()),
  ], gitDiffValue, 'GitDiffResponse'),
  descriptor('branches', [parameter('cwd', z.string())], gitBranchesValue, 'GitBranches'),
  descriptor('checkout', [parameter('cwd', z.string()), parameter('branch', z.string())], gitActionValue, 'GitActionResponse'),
  descriptor('createBranch', [parameter('cwd', z.string()), parameter('name', z.string())], gitActionValue, 'GitActionResponse'),
  descriptor('lastMessage', [parameter('cwd', z.string())], gitMessageTextValue, 'GitMessageText'),
  descriptor('discard', [parameter('cwd', z.string()), parameter('paths', pathList)], gitActionValue, 'GitActionResponse'),
  descriptor('stage', [parameter('cwd', z.string()), parameter('paths', pathList)], gitActionValue, 'GitActionResponse'),
  descriptor('unstage', [parameter('cwd', z.string()), parameter('paths', pathList)], gitActionValue, 'GitActionResponse'),
  descriptor('stageAll', [parameter('cwd', z.string())], gitActionValue, 'GitActionResponse'),
  descriptor('unstageAll', [parameter('cwd', z.string())], gitActionValue, 'GitActionResponse'),
  descriptor('commit', [
    parameter('cwd', z.string()), parameter('message', z.string()), parameter('amend', z.boolean()),
  ], gitCommitResultValue, 'GitCommitResponse'),
  descriptor('push', [parameter('cwd', z.string())], gitActionValue, 'GitActionResponse'),
  descriptor('pull', [parameter('cwd', z.string())], gitActionValue, 'GitActionResponse'),
  descriptor('fetch', [parameter('cwd', z.string())], gitActionValue, 'GitActionResponse'),
  descriptor('identity', [parameter('cwd', z.string())], gitIdentityValue, 'GitIdentity'),
  descriptor('message', [parameter('sessionId', z.string()), parameter('cwd', z.string())], gitMessageValue, 'GitMessageResponse'),
] as const

export const TYPERT_REMOTE: TypertRemoteContribution = { package: 'dsh-git-timeline', descriptors }
export const TYPERT = {
  package: 'dsh-git-timeline', face: 'host', schemas: [], invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'gitPanel/status': (cwd: string) => Promise<RemoteResult<GitStatusResponse>>
    'gitPanel/log': (cwd: string, limit?: number) => Promise<RemoteResult<GitLogResponse>>
    'gitPanel/diff': (cwd: string, path: string, staged: boolean) => Promise<RemoteResult<GitDiffResponse>>
    'gitPanel/show': (cwd: string, hash: string) => Promise<RemoteResult<GitCommitDetail>>
    'gitPanel/showFile': (cwd: string, hash: string, path: string) => Promise<RemoteResult<GitDiffResponse>>
    'gitPanel/branches': (cwd: string) => Promise<RemoteResult<GitBranches>>
    'gitPanel/checkout': (cwd: string, branch: string) => Promise<RemoteResult<GitActionResponse>>
    'gitPanel/createBranch': (cwd: string, name: string) => Promise<RemoteResult<GitActionResponse>>
    'gitPanel/lastMessage': (cwd: string) => Promise<RemoteResult<GitMessageText>>
    'gitPanel/discard': (cwd: string, paths: readonly string[]) => Promise<RemoteResult<GitActionResponse>>
    'gitPanel/stage': (cwd: string, paths: readonly string[]) => Promise<RemoteResult<GitActionResponse>>
    'gitPanel/unstage': (cwd: string, paths: readonly string[]) => Promise<RemoteResult<GitActionResponse>>
    'gitPanel/stageAll': (cwd: string) => Promise<RemoteResult<GitActionResponse>>
    'gitPanel/unstageAll': (cwd: string) => Promise<RemoteResult<GitActionResponse>>
    'gitPanel/commit': (cwd: string, message: string, amend: boolean) => Promise<RemoteResult<GitCommitResponse>>
    'gitPanel/push': (cwd: string) => Promise<RemoteResult<GitActionResponse>>
    'gitPanel/pull': (cwd: string) => Promise<RemoteResult<GitActionResponse>>
    'gitPanel/fetch': (cwd: string) => Promise<RemoteResult<GitActionResponse>>
    'gitPanel/identity': (cwd: string) => Promise<RemoteResult<GitIdentity>>
    'gitPanel/message': (sessionId: string, cwd: string) => Promise<RemoteResult<GitMessageResponse>>
  }
}

export default TYPERT_REMOTE
