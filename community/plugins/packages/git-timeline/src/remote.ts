/** gitTimeline Remote 的 Typert 贡献：描述符 + 线上类型映射。 */

import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { ChangedResponse, GitLogResponse } from './types.js'
import { changedValue, gitLogValue } from './types.js'

const strict = (typeSymbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol, schema })
const parameter = (name: string, schema: z.ZodType) => ({
  name, wire: name, source: 'json' as const, codec: strict(`dsh-git-timeline/types#${name}`, schema),
})
const descriptor = (method: string, parameters: readonly ReturnType<typeof parameter>[], result: z.ZodType, type: string) => ({
  id: `dsh-git-timeline#gitTimeline/${method}`,
  service: 'gitTimeline', namespace: 'gitTimeline', method, invocation: { kind: 'direct' as const }, parameters,
  result: strict(`dsh-git-timeline/types#${type}`, result),
})

const descriptors = [
  descriptor(
    'log',
    [parameter('cwd', z.string()), parameter('path', z.string().optional()), parameter('count', z.number().optional())],
    gitLogValue,
    'GitLogResponse',
  ),
  descriptor('changed', [parameter('cwd', z.string())], changedValue, 'ChangedResponse'),
] as const

export const TYPERT_REMOTE: TypertRemoteContribution = { package: 'dsh-git-timeline', descriptors }
export const TYPERT = {
  package: 'dsh-git-timeline', face: 'host', schemas: [], invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'gitTimeline/log': (cwd: string, path?: string, count?: number) => Promise<RemoteResult<GitLogResponse>>
    'gitTimeline/changed': (cwd: string) => Promise<RemoteResult<ChangedResponse>>
  }
}

export default TYPERT_REMOTE
