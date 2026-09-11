/** browserAgent Remote 的 Typert 贡献：面板三个方法的描述符与线上类型映射。 */

import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { BrowserInterruptResult, BrowserLiveView, BrowserPanelSnapshot, BrowserPreviewResult, BrowserStopResult } from './types.js'
import { browserInterruptValue, browserLiveValue, browserPanelValue, browserPreviewValue, browserStopValue } from './types.js'

const strict = (typeSymbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol, schema })
const parameter = (name: string, schema: z.ZodType) => ({
  name, wire: name, source: 'json' as const, codec: strict(`dsh-browser-agent/types#${name}`, schema),
})
const descriptor = (
  method: string,
  parameters: readonly ReturnType<typeof parameter>[],
  result: z.ZodType,
  type: string,
) => ({
  id: `dsh-browser-agent#browserAgent/${method}`,
  service: 'browserAgent',
  namespace: 'browserAgent',
  method,
  invocation: { kind: 'direct' as const },
  parameters,
  result: strict(`dsh-browser-agent/types#${type}`, result),
})

const sessionId = (): ReturnType<typeof parameter> => parameter('sessionId', z.string())

const descriptors = [
  descriptor('panel', [sessionId()], browserPanelValue, 'BrowserPanelSnapshot'),
  descriptor('stop', [sessionId()], browserStopValue, 'BrowserStopResult'),
  descriptor('preview', [sessionId()], browserPreviewValue, 'BrowserPreviewResult'),
  descriptor('live', [sessionId()], browserLiveValue, 'BrowserLiveView'),
  descriptor('interrupt', [sessionId()], browserInterruptValue, 'BrowserInterruptResult'),
] as const

/** 供客户端 `remote.$mount` 使用的贡献。 */
export const TYPERT_REMOTE: TypertRemoteContribution = { package: 'dsh-browser-agent', descriptors }

/** 宿主侧的类型清单。 */
export const TYPERT = {
  package: 'dsh-browser-agent', face: 'host', schemas: [], invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'browserAgent/panel': (sessionId: string) => Promise<RemoteResult<BrowserPanelSnapshot>>
    'browserAgent/stop': (sessionId: string) => Promise<RemoteResult<BrowserStopResult>>
    'browserAgent/preview': (sessionId: string) => Promise<RemoteResult<BrowserPreviewResult>>
    'browserAgent/live': (sessionId: string) => Promise<RemoteResult<BrowserLiveView>>
    'browserAgent/interrupt': (sessionId: string) => Promise<RemoteResult<BrowserInterruptResult>>
  }
}

export default TYPERT_REMOTE
