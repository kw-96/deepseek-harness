import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type {
  FsListResponse, ProjectCreateRequest, ProjectDeleteRequest, ProjectDeleteResponse, ProjectListResponse,
  ProjectRenameRequest, ProjectSetRootsRequest, ProjectValue,
  TerminalFollowFrame, TerminalListResponse, TerminalOpenOptions, TerminalOpenResponse, TerminalReadResponse,
  TerminalResizeResponse, TerminalSendResponse, TerminalWriteResponse,
} from './types.js'
import {
  fsListValue, projectDeleteValue, projectListValue, projectValue,
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
const descriptors = [
  descriptor('fsList', [parameter('path', z.string())], fsListValue, 'FsListResponse'),
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
  descriptor('terminalClose', [parameter('sessionId', z.string()), parameter('terminalId', z.string())], terminalOkValue, 'TerminalCloseResponse'),
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
    'codexShell/terminalOpen': (sessionId: string, options?: TerminalOpenOptions) => Promise<RemoteResult<TerminalOpenResponse>>
    'codexShell/terminalList': (sessionId: string) => Promise<RemoteResult<TerminalListResponse>>
    'codexShell/terminalSend': (sessionId: string, terminalId: string, text: string) => Promise<RemoteResult<TerminalSendResponse>>
    'codexShell/terminalFollow': (sessionId: string, terminalId: string, signal?: AbortSignal) => AsyncIterable<TerminalFollowFrame>
    'codexShell/terminalWrite': (sessionId: string, terminalId: string, data: string) => Promise<RemoteResult<TerminalWriteResponse>>
    'codexShell/terminalResize': (sessionId: string, terminalId: string, cols: number, rows: number) => Promise<RemoteResult<TerminalResizeResponse>>
    'codexShell/terminalRead': (sessionId: string, terminalId: string) => Promise<RemoteResult<TerminalReadResponse>>
    'codexShell/terminalClose': (sessionId: string, terminalId: string) => Promise<RemoteResult<{ ok: true }>>
    'codexShell/projectList': () => Promise<RemoteResult<ProjectListResponse>>
    'codexShell/projectCreate': (request: ProjectCreateRequest) => Promise<RemoteResult<ProjectValue>>
    'codexShell/projectRename': (request: ProjectRenameRequest) => Promise<RemoteResult<ProjectValue>>
    'codexShell/projectSetRoots': (request: ProjectSetRootsRequest) => Promise<RemoteResult<ProjectValue>>
    'codexShell/projectDelete': (request: ProjectDeleteRequest) => Promise<RemoteResult<ProjectDeleteResponse>>
  }
}

export default TYPERT_REMOTE
