/**
 * Background-job plugin, browser half: contributes one session-header action
 * that renders this session's `ctx.jobs` records and can cancel a live one.
 * Records arrive entirely through the `jobsBySession` list mirror; the cancel
 * is the only RPC this plugin issues, and the host republishes the session's
 * job frame when the registry changes, so the row settles without a refetch.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { JobListAction } from './JobListAction.tsx'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import { en, NS, zh, type JobKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Background-job list copy. */
    'job': JobKey
  }
}

export type { JobListActionInjected, JobListActionProps } from './JobListAction.tsx'

/** Required services for locale registration, the header slot, and the cancel RPC. */
export const inject = ['sessions', 'slots', 'locale', 'remote.session']

/**
 * Client plugin body: register the dictionaries and the header action.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-job: dictionaries')
  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'job-list',
      // After the subagent catalog: session lineage reads before process work.
      order: 20,
      locale: NS,
      // The face factory binds this action's session, so the component only
      // names the job it wants stopped.
      inject: (sessionId: SessionId) => ({
        // The registry rejects an id it does not know or does not own; the row
        // then keeps showing its live status rather than a false success.
        stopJob: (jobId: JobId) => {
          void ctx.remote.session.killJob({ sessionId, jobId, reason: 'stopped from the session job list' })
        },
      }),
    }, JobListAction),
  )
}
