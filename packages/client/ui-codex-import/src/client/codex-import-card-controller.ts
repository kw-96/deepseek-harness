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
// Type-only: 拉入 ui-workspace 的 Context 合并（ctx.uiWorkspace），会话打开改走该导航面。
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session-import-codex/remote'
import type { CodexImportRun, CodexImportScanValue } from '@deepseek-ai/dsh-session-import-codex/types'

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
  /** True while a preview or an undo/restore round-trip is in flight. */
  busy: boolean
  runs: readonly CodexImportRun[]
  /** The last read-only preview, or null before the first one. */
  preview: CodexImportScanValue | null
}

/** The registration-side face the card's slot entry injects. */
export interface CodexImportCardFace {
  hooks: {
    /** Card snapshot bound by the renderer as useCodexImportCard. */
    codexImportCard: SnapshotStore<CodexImportCardState>
  }
  toggleSync: (value: boolean) => void
  runImport: () => void
  preview: () => void
  undo: (at: number) => void
  restore: (at: number) => void
  openSession: (sessionId: SessionId) => void
}

const INITIAL: CodexImportCardState = {
  autoSync: false,
  running: false,
  busy: false,
  runs: [],
  preview: null,
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
      preview: () => { void this.preview() },
      undo: (at) => { void this.setArchived(at, true) },
      restore: (at) => { void this.setArchived(at, false) },
      openSession: (sessionId) => { this.openSession(sessionId) },
    }
  }

  /** Stop deriving and freeze later updates. */
  dispose(): void {
    this.disposed = true
    this.unsubscribe?.()
  }

  private derive(): void {
    const autoSync = this.scope.getSnapshot().value?.autoSync ?? false
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
      if (this.disposed || !carried.ok) return
      // The run invalidates the preview the card may still be showing.
      this.store.update((draft) => { draft.runs = [carried.value, ...draft.runs]; draft.preview = null })
    } finally {
      if (!this.disposed) this.store.update((draft) => { draft.running = false })
    }
  }

  private async preview(): Promise<void> {
    if (this.disposed || this.store.getSnapshot().busy) return
    this.store.update((draft) => { draft.busy = true })
    try {
      const carried = await this.ctx.remote.codexImport.scan()
      if (this.disposed) return
      this.store.update((draft) => { draft.preview = carried.ok ? carried.value : null })
    } finally {
      if (!this.disposed) this.store.update((draft) => { draft.busy = false })
    }
  }

  /**
   * Archive or unarchive one run's sessions, then re-read history so the card
   * shows the run's own `undoneAt` stamp instead of guessing at it.
   * @param at - run time identifying the run.
   * @param undone - true to undo, false to restore.
   */
  private async setArchived(at: number, undone: boolean): Promise<void> {
    if (this.disposed || this.store.getSnapshot().busy) return
    this.store.update((draft) => { draft.busy = true })
    try {
      const carried = undone
        ? await this.ctx.remote.codexImport.undo(at)
        : await this.ctx.remote.codexImport.restore(at)
      if (this.disposed || !carried.ok) return
      await this.refreshHistory()
    } finally {
      if (!this.disposed) this.store.update((draft) => { draft.busy = false })
    }
  }

  private openSession(sessionId: SessionId): void {
    // 官方 v0.1.6-alpha.2 起，会话选择由 ui-workspace 的导航面统一承担
    // （ISessions 不再暴露 open）。
    this.ctx.uiWorkspace.openSession(sessionId)
  }
}
