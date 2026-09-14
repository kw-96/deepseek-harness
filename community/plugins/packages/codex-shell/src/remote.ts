/**
 * Typert Remote 贡献：底栏终端的 PTY 读写与输出流。
 *
 * `terminalOpen` 同时被 dsh-codex-left 的侧栏会话菜单调用（「在终端中打开」），
 * 因此服务名 `codexShell` 是跨插件的稳定接口：改名前需同步左侧插件。
 */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type {
  TerminalFollowFrame, TerminalListResponse, TerminalOpenOptions, TerminalOpenResponse,
  TerminalReadResponse, TerminalResizeResponse, TerminalSendResponse, TerminalWriteResponse,
} from './types.js'
import {
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
] as const

export const TYPERT_REMOTE: TypertRemoteContribution = { package: 'dsh-codex-shell', descriptors }
export const TYPERT = {
  package: 'dsh-codex-shell', face: 'host', schemas: [], invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'codexShell/terminalOpen': (sessionId: string, options?: TerminalOpenOptions) => Promise<RemoteResult<TerminalOpenResponse>>
    'codexShell/terminalList': (sessionId: string) => Promise<RemoteResult<TerminalListResponse>>
    'codexShell/terminalSend': (sessionId: string, terminalId: string, text: string) => Promise<RemoteResult<TerminalSendResponse>>
    'codexShell/terminalFollow': (sessionId: string, terminalId: string, signal?: AbortSignal) => AsyncIterable<TerminalFollowFrame>
    'codexShell/terminalWrite': (sessionId: string, terminalId: string, data: string) => Promise<RemoteResult<TerminalWriteResponse>>
    'codexShell/terminalResize': (sessionId: string, terminalId: string, cols: number, rows: number) => Promise<RemoteResult<TerminalResizeResponse>>
    'codexShell/terminalRead': (sessionId: string, terminalId: string) => Promise<RemoteResult<TerminalReadResponse>>
    'codexShell/terminalClose': (sessionId: string, terminalId: string) => Promise<RemoteResult<{ ok: true }>>
  }
}

export default TYPERT_REMOTE
