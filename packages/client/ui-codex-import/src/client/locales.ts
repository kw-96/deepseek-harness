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
  | 'open'

export const en: Record<CodexImportKey, string> = {
  title: 'Codex import',
  description: 'Import local Codex threads as sessions and keep them in sync.',
  sync: 'Keep import in sync',
  run: 'Import now',
  running: 'Importing…',
  historyTitle: 'Import history',
  empty: 'No imports yet.',
  noSessions: 'This run imported no new sessions.',
  importedCount: 'Imported {count}',
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
  noSessions: '本轮没有导入新会话。',
  importedCount: '已导入 {count} 项',
  open: '打开',
}
