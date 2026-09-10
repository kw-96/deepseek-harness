/** Locale dictionary for the git-timeline tab UI. */

export const zh = {
  tabTitle: 'Git 时间线',
  guideTitle: 'Git 时间线',
  guideDescription: '查看某个文件的提交历史；右侧点选变更文件即可跳转。',
  refresh: '刷新',
  filterPlaceholder: '文件路径（相对仓库根，留空＝整个仓库）',
  filterClear: '清除筛选',
  scopeRepo: '整个仓库',
  changedTitle: '变更文件',
  changedEmpty: '工作区干净',
  notRepo: '当前工作区不是 Git 仓库',
  loading: '加载中…',
  empty: '没有提交记录',
  timeNow: '刚刚',
  timeMinAgo: '{n} 分钟前',
  timeHourAgo: '{n} 小时前',
  timeDayAgo: '{n} 天前',
} as const

export type LocaleKey = keyof typeof zh

export const en: Record<LocaleKey, string> = {
  tabTitle: 'Git Timeline',
  guideTitle: 'Git Timeline',
  guideDescription: 'Commit history for one file; pick a changed file on the right to jump to it.',
  refresh: 'Refresh',
  filterPlaceholder: 'File path (repository-relative; empty = whole repository)',
  filterClear: 'Clear filter',
  scopeRepo: 'Whole repository',
  changedTitle: 'Changed files',
  changedEmpty: 'Working tree clean',
  notRepo: 'This workspace is not a Git repository',
  loading: 'Loading…',
  empty: 'No commits yet',
  timeNow: 'just now',
  timeMinAgo: '{n} min ago',
  timeHourAgo: '{n} h ago',
  timeDayAgo: '{n} d ago',
}
