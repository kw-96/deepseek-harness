/**
 * The browser-side {@link GitHubUiShell} adapter (ADR-0008): binds the port's
 * members to the dsh client services and plain browser facilities.
 *
 * - `registerSlot('settings.section')` narrows to a page of the Plugins
 *   settings section (its tab strip); the dock keeps its slot name.
 * - `prompt` sends into the session the dock last rendered for — v1 renders
 *   one active conversation at a time, matching the dsh web layout.
 * - `openExternal` opens http(s) URLs only, mirroring the dsh safe-anchor
 *   convention; anything else is silently refused.
 * @module dsh-github/ui/client/shell
 */

import type { ReactNode } from 'react'
import type { GitHubUiShell, GitHubUiSlotId } from '../types.js'
import type { ClientContext, ClientSlotProps } from './shims.js'

/**
 * Where each port slot id lands in the dsh slot registry (ADR-0008).
 *
 * The settings target moved from the retired one-card-per-plugin seat
 * (`settings.plugin.item`, absent from the 0.1.7 SlotMap) to the tab seat the
 * Plugins section declares (`ui-settings-plugins` declares exactly that one
 * child). The move is not cosmetic: `ctx.slots.inject` waits for a declaration
 * that never arrives without reporting anything, so registering against a
 * retired key silently contributes nothing.
 */
const SLOT_TARGETS: Record<GitHubUiSlotId, string> = {
  'settings.section': 'settings.plugins.tab',
  'conversation.input.dock': 'conversation.input.dock',
}

/** List-slot ordering after the built-in dsh cards and docks. */
const SLOT_ORDER = 30

/**
 * Build the shell over the client context.
 * @param ctx - the client plugin's context (slots + sessions services).
 * @returns the port implementation `installGitHubUi` mounts through.
 */
export function createBrowserShell(ctx: ClientContext): GitHubUiShell {
  let currentSession: string | undefined
  return {
    registerSlot: (slot, render, label) => {
      const target = SLOT_TARGETS[slot]
      const component = (props: ClientSlotProps): ReactNode => {
        if (props.sessionId !== undefined) currentSession = props.sessionId
        return render()
      }
      return ctx.slots.inject(target, () =>
        ctx.slots.register({
          name: target,
          id: 'github',
          order: SLOT_ORDER,
          ...label === undefined ? {} : { label },
        }, component))
    },
    sessionId: () => currentSession,
    prompt: text => {
      if (currentSession === undefined) return
      // Session addressing stays inject-free: both verbs live on the injected
      // sessions service, and the scoped context is only an opaque handle —
      // reading a service property off it (`scoped.conversation`) would
      // re-enter the inject check this plugin cannot satisfy (ADR-0008).
      const scoped = ctx.sessions.scope(currentSession)
      if (scoped === undefined) return
      void ctx.sessions.sessionOf(scoped)?.prompt([{ type: 'text', text }], 'queue')
    },
    openExternal: url => {
      if (!/^https?:\/\//.test(url)) return
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    copyText: async text => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // Clipboard denial (or a jsdom environment without the API): the
        // user code stays visible in the card, so nothing else can fail.
      }
    },
    confirmIrreversible: question => Promise.resolve(window.confirm(question)),
    visibility: {
      visible: () => !document.hidden,
      onChange: listener => {
        const handler = (): void => listener(!document.hidden)
        document.addEventListener('visibilitychange', handler)
        return () => document.removeEventListener('visibilitychange', handler)
      },
    },
  }
}
