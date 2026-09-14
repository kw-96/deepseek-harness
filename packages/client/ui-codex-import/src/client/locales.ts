/** Card copy owned by this plugin. Every product-visible string lives here. */

/** Dictionary namespace shared by the locale registration and the card slot. */
export const NS = 'settings.codexImport'

/** The keys the card renders; keep in sync with both dictionaries. */
export type CodexImportKey =
  | 'title'
  | 'description'
  | 'collapse'
  | 'expand'
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
  | 'preview'
  | 'previewing'
  | 'previewTitle'
  | 'previewEmpty'
  | 'previewImported'
  | 'previewUpdated'
  | 'previewUnchanged'
  | 'previewDeferred'
  | 'previewFailed'
  | 'undo'
  | 'restore'
  | 'undone'
  | 'busy'
  | 'kindImported'
  | 'kindUpdated'
  | 'kindUnchanged'
  | 'kindDeferred'

export const en: Record<CodexImportKey, string> = {
  title: 'Codex import',
  description: 'Import local Codex threads as sessions and keep them in sync.',
  collapse: 'Collapse',
  expand: 'Expand',
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
  preview: 'Preview',
  previewing: 'Checking…',
  previewTitle: 'What the next import would change',
  previewEmpty: 'Nothing to import from the Codex store.',
  previewImported: 'Import {count}',
  previewUpdated: 'Update {count}',
  previewUnchanged: 'Already current {count}',
  previewDeferred: 'Deferred {count} active',
  previewFailed: 'Preview failed.',
  undo: 'Undo',
  restore: 'Restore',
  undone: 'Undone',
  busy: 'Working…',
  kindImported: 'would import',
  kindUpdated: 'would update',
  kindUnchanged: 'current',
  kindDeferred: 'deferred',
}

export const zh: Record<CodexImportKey, string> = {
  title: 'Codex 导入',
  description: '把本地 Codex 线程导入为会话,并保持同步。',
  collapse: '收起',
  expand: '展开',
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
  preview: '预览',
  previewing: '检查中…',
  previewTitle: '下次导入会带来的变化',
  previewEmpty: 'Codex 存储里没有可导入的内容。',
  previewImported: '将导入 {count} 项',
  previewUpdated: '将更新 {count} 项',
  previewUnchanged: '已是最新 {count} 项',
  previewDeferred: '活跃会话延后 {count} 项',
  previewFailed: '预览失败。',
  undo: '撤销',
  restore: '恢复',
  undone: '已撤销',
  busy: '处理中…',
  kindImported: '将导入',
  kindUpdated: '将更新',
  kindUnchanged: '已最新',
  kindDeferred: '延后',
}
