/**
 * One-call installation: mount the settings section and the status bar into
 * their client slots (design §3) and hand back a single disposer. The web
 * client calls this with its shell adapter and Typert Client Remote.
 * @module dsh-github/ui/install
 */

import { createElement as h } from 'react'
import { catalogFor, type UiLocale } from './i18n.js'
import { ConnectGitHubSection } from './settings-section.js'
import type { GitHubUiRemote, GitHubUiShell } from './types.js'
import { PrStatusBar, type PollPolicy, type StatusBarTimers } from './status-bar.js'

/** Installation knobs, all defaulted. */
export interface GitHubUiOptions {
  readonly locale?: UiLocale
  readonly poll?: PollPolicy
  /** Flow-state poll pacing (ADR-0009), independent of the CI badge's. */
  readonly flowPoll?: PollPolicy
  readonly collapseMs?: number
  /** Loading cap of the agent-driven [Create PR] (ADR-0011). */
  readonly createTimeoutMs?: number
  readonly timers?: StatusBarTimers
}

/**
 * Register both slots.
 * @param shell - the client shell adapter (ADR-0007).
 * @param remote - the Typert Client Remote slice.
 * @param options - optional locale and pacing knobs.
 * @returns a disposer that unregisters both slots.
 */
export function installGitHubUi(shell: GitHubUiShell, remote: GitHubUiRemote, options: GitHubUiOptions = {}): () => void {
  const locale = options.locale === undefined ? {} : { locale: options.locale }
  const timers = options.timers === undefined ? {} : { timers: options.timers }
  const offSection = shell.registerSlot('settings.section', () =>
    h(ConnectGitHubSection, { remote, shell, ...locale, ...timers }),
    catalogFor(options.locale ?? 'en').tabLabel)
  const offDock = shell.registerSlot('conversation.input.dock', () =>
    h(PrStatusBar, {
      remote,
      shell,
      ...locale,
      ...timers,
      ...options.poll === undefined ? {} : { poll: options.poll },
      ...options.flowPoll === undefined ? {} : { flowPoll: options.flowPoll },
      ...options.collapseMs === undefined ? {} : { collapseMs: options.collapseMs },
      ...options.createTimeoutMs === undefined ? {} : { createTimeoutMs: options.createTimeoutMs },
    }))
  return () => {
    offSection()
    offDock()
  }
}
