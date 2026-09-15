/** Client Session object layer, Agent scopes, and Remote lifecycle wiring. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent/types'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-file-upload/client'
import { createSessionControlStream, type SessionControlStream } from './transport.ts'
import { ClientSessions } from './sessions/service.ts'
import type { SessionRemotes } from './sessions/remotes.ts'
import type {} from '../remote-events.ts'

export {
  createSessionControlStream,
  SessionEventStream,
  SESSION_SEARCH_RESULT_LIMIT,
  SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS,
} from './transport.ts'
export type {
  ClientSessionPageRequest,
  SessionControlStream,
  SessionControlStreamOptions,
  SessionEventStreamOptions,
  SessionJournalChange,
  SessionRemote,
} from './transport.ts'
export { createScope, scopeOf } from './scope.ts'
export type { AgentContext, AgentScopeHandle } from './scope.ts'
export { SessionCreateError, SessionForkError } from './sessions/service.ts'
export type { SessionBinding, SessionListState, SessionSummary } from './sessions/service.ts'
export type {
  SessionListPhase,
  SessionListSnapshot,
  SessionSearchResultItem,
  SubagentCatalogSnapshot,
} from './sessions/manager.ts'
export type { Session } from './sessions/session.ts'
export type {
  ProjectionsBaseline,
  ProjectionValueStore,
  SessionProjectionMap,
  UseProjection,
} from './sessions/projection-store.ts'
export type {
  BeginSubmissionInput,
  ISession,
  PendingSubmissionRetirement,
  ProjectionsFace,
  SessionFace,
  SubmissionHandle,
} from './contract/session.ts'
export type { ISessions } from './contract/sessions.ts'
export { MutableSessionEventSource } from './contract/events.ts'
export type {
  AssistantLiveChunkEvent,
  SessionAssistantSettlementEntry,
  SessionEventChange,
  SessionEventLike,
  SessionEventLikeEntry,
  SessionEventSource,
  SessionEventWindow,
  SessionLiveEventEntry,
  SessionTransientEventEntry,
} from './contract/events.ts'
export type {
  OpenState,
  PendingSubmission,
  PendingSubmissionAttachment,
  PendingSubmissionFileAttachment,
  PendingSubmissionImage,
  PendingSubmissionImageAttachment,
  PendingSubmissionPlacement,
  PromptError,
  QueuedMessage,
  SessionSnapshot,
} from './contract/snapshot.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Client Session object layer and Agent scope owner. */
    sessions: import('./contract/sessions.ts').ISessions
  }
}

/** Required Remote and Context projection services. */
export const inject = [
  'connection',
  'fileUpload',
  'typert',
  'remote',
  'remote.commands',
  'remote.session',
  'remote.subagents',
]

/**
 * Delay before a terminally failed control stream is replaced. Reaching this
 * path means the stream's own retry budget is spent, and every mirror it feeds
 * — Session queues, background jobs, projections — has no second source, so the
 * replacement is what keeps a tab converging instead of frozen until its next
 * page load.
 */
const CONTROL_RESTART_DELAY_MS = 1_000

/**
 * Ceiling for the replacement delay. Consecutive terminal failures double it,
 * so a Host that keeps refusing the stream is retried at a bounded rate rather
 * than once per base delay; an accepted baseline restores the base delay.
 */
const CONTROL_RESTART_MAX_DELAY_MS = 30_000

/**
 * Install Client Session state and its reconnecting control stream.
 * @param ctx - Client Cordis context.
 */
export function apply(ctx: Context): void {
  const remotes = ctx.remote as unknown as SessionRemotes
  const sessions = new ClientSessions(ctx, remotes)
  ctx.remote.$on('api-session/added', (summary) => { sessions.handleSessionAdded(summary) })
  ctx.remote.$on('api-session/removed', (sessionId) => { sessions.handleSessionRemoved(sessionId) })
  ctx.remote.$on('api-session/status', (sessionId, running) => {
    sessions.handleSessionStatus(sessionId, running)
  })
  ctx.remote.$on('api-session/activity', (sessionId, updatedAt) => {
    sessions.handleSessionActivity(sessionId, updatedAt)
  })
  ctx.remote.$on('api-session/error', (sessionId, message) => {
    sessions.handleSessionError(sessionId, message)
  })

  let control: SessionControlStream | undefined
  let restartDelay = CONTROL_RESTART_DELAY_MS
  let restartTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  /** Open one control generation; a terminal failure schedules its successor. */
  const openControl = (): void => {
    if (disposed) return
    const stream = createSessionControlStream(remotes, {
      accept: (frame) => {
        if (frame.type === 'baseline') restartDelay = CONTROL_RESTART_DELAY_MS
        sessions.handleControlFrame(frame)
      },
      failed: (error) => {
        // A failed generation never revives on its own, so without a successor
        // every later queue, job, and projection frame is lost for the rest of
        // the page lifetime.
        console.error('[session-controller] control stream failed; reopening:', error)
        // A replacement may already own the mirror: only the live stream
        // schedules its own successor.
        if (control !== stream) return
        control = undefined
        void stream.dispose()
        const delay = restartDelay
        restartDelay = Math.min(restartDelay * 2, CONTROL_RESTART_MAX_DELAY_MS)
        restartTimer = setTimeout(() => {
          restartTimer = undefined
          openControl()
        }, delay)
      },
    })
    control = stream
    stream.start()
  }
  openControl()

  ctx.on('connection/reset', () => {
    sessions.handleConnected()
    // A new Host generation republishes every baseline, so the mirror is
    // resynced rather than left describing the generation that just ended.
    control?.restart()
  })
  if (ctx.remote.$host.home !== undefined) sessions.handleConnected()
  ctx.typert.contexts.registerClient('agent', {
    identity: candidate => sessions.scopeOf(candidate),
    resolve: sessionId => sessions.resolveAgentScope(sessionId),
  })
  ctx.effect(() => async () => {
    disposed = true
    if (restartTimer !== undefined) clearTimeout(restartTimer)
    restartTimer = undefined
    await control?.dispose()
    control = undefined
  }, 'session-controller.client.control')
}
