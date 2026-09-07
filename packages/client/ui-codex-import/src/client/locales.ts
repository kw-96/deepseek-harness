/** Card copy owned by this plugin. Every product-visible string lives here. */

/** Dictionary namespace shared by the locale registration and the card slot. */
export const NS = 'settings.codexImport'

/** The keys the card renders; keep in sync with both dictionaries. */
export type CodexImportKey =
  | 'title'
  | 'description'
  | 'sync'
  | 'run'
  | 'running'
  | 'historyTitle'
  | 'empty'
  | 'noSessions'
  | 'importedCount'
  | 'updatedCount'
  | 'deferredActiveCount'
  | 'open'

export const en: Record<CodexImportKey, string> = {
  title: 'Codex import',
  description: 'Import local Codex threads as sessions and keep them in sync.',
  sync: 'Keep import in sync',
  run: 'Import now',
  running: 'Importing…',
  historyTitle: 'Import history',
  empty: 'No imports yet.',
  noSessions: 'This run made no session changes.',
  importedCount: 'Imported {count}',
  updatedCount: 'Updated {count}',
  deferredActiveCount: 'Deferred {count} active',
  open: 'Open',
}

export const zh: Record<CodexImportKey, string> = {
  title: 'Codex 导入',
  description: '把本地 Codex 线程导入为会话,并保持同步。',
  sync: '保持导入同步',
  run: '立即导入',
  running: '导入中…',
  historyTitle: '导入历史',
  empty: '还没有导入记录。',
  noSessions: '本轮没有会话变更。',
  importedCount: '已导入 {count} 项',
  updatedCount: '已更新 {count} 项',
  deferredActiveCount: '活跃会话延后 {count} 项',
  open: '打开',
}
