/**
 * Browser-local object layer for the Codex import card. Reads the `autoSync`
 * toggle through the settings scope, triggers the manual import and history
 * read through the generated `codexImport` Remote, and opens an imported
 * session through the client sessions service.
 * @module @deepseek-ai/dsh-client-ui-codex-import/client/controller
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session-import-codex/remote'
import type { CodexImportRun } from '@deepseek-ai/dsh-session-import-codex/types'

/** Host settings namespace the card edits; mirrored from the Host plugin. */
export const CODEX_IMPORT_NS = 'codex-import'

/** The `autoSync` field the card reads and writes. */
export interface CodexImportSettings {
  readonly autoSync: boolean
}

/** What the card renders. */
export interface CodexImportCardState {
  autoSync: boolean
  running: boolean
  runs: readonly CodexImportRun[]
}

/** The registration-side face the card's slot entry injects. */
export interface CodexImportCardFace {
  hooks: {
    /** Card snapshot bound by the renderer as useCodexImportCard. */
    codexImportCard: SnapshotStore<CodexImportCardState>
  }
  toggleSync: (value: boolean) => void
  runImport: () => void
  openSession: (sessionId: SessionId) => void
}

const INITIAL: CodexImportCardState = {
  autoSync: true,
  running: false,
  runs: [],
}

/** Bridges the `codex-import` scope and the `codexImport` Remote onto the card. */
export class CodexImportCardController {
  private readonly store: SnapshotStore<CodexImportCardState>
  private readonly unsubscribe: (() => void) | undefined
  private disposed = false

  /**
   * @param ctx - client root context carrying the Remote and sessions services.
   * @param scope - the bound settings scope for the `codex-import` namespace.
   */
  constructor(
    private readonly ctx: ClientContext,
    private readonly scope: SettingsScope<CodexImportSettings>,
  ) {
    this.store = createSnapshotStore(INITIAL)
    this.unsubscribe = scope.subscribe(() => { this.derive() })
    this.derive()
    void this.refreshHistory()
  }

  /** Build the face the card's slot registration injects. */
  inject(): CodexImportCardFace {
    return {
      hooks: { codexImportCard: this.store },
      toggleSync: (value) => { this.toggleSync(value) },
      runImport: () => { void this.runImport() },
      openSession: (sessionId) => { this.openSession(sessionId) },
    }
  }

  /** Stop deriving and freeze later updates. */
  dispose(): void {
    this.disposed = true
    this.unsubscribe?.()
  }

  private derive(): void {
    const autoSync = this.scope.getSnapshot().value?.autoSync ?? true
    this.store.update((draft) => { draft.autoSync = autoSync })
  }

  private async refreshHistory(): Promise<void> {
    const carried = await this.ctx.remote.codexImport.history()
    if (this.disposed || !carried.ok) return
    this.store.update((draft) => { draft.runs = carried.value.runs })
  }

  private toggleSync(value: boolean): void {
    if (this.disposed) return
    this.store.update((draft) => { draft.autoSync = value })
    void this.scope.set('autoSync', value)
  }

  private async runImport(): Promise<void> {
    if (this.disposed || this.store.getSnapshot().running) return
    this.store.update((draft) => { draft.running = true })
    try {
      const carried = await this.ctx.remote.codexImport.run()
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- dispose() can run during the await and flip this flag
      if (this.disposed || !carried.ok) return
      this.store.update((draft) => { draft.runs = [carried.value, ...draft.runs] })
    } finally {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- dispose() can run during the await and flip this flag
      if (!this.disposed) this.store.update((draft) => { draft.running = false })
    }
  }

  private openSession(sessionId: SessionId): void {
    this.ctx.sessions.open(sessionId)
  }
}
