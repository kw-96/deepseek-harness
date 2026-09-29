/** 桌面面板的设置文案（中英双语）。 */

export const zh = {
  tab: '桌面面板',
  title: '桌面面板',
  description: '在浏览器里查看并操作本机桌面（含锁屏画面）',
  stateEnabled: '已启用',
  stateDisabled: '已停用',
  enable: '启用',
  disable: '停用',
  address: '访问地址',
  copy: '复制',
  copied: '已复制',
  workerRunning: '桌面 worker 运行中',
  workerStopped: '桌面 worker 未运行',
  loading: '正在读取状态…',
  loadFailed: '状态读取失败',
  toggleFailed: '切换失败',
}

export const en = {
  tab: 'Desktop panel',
  title: 'Desktop panel',
  description: 'View and control this machine’s desktop (including the lock screen) from a browser',
  stateEnabled: 'Enabled',
  stateDisabled: 'Disabled',
  enable: 'Enable',
  disable: 'Disable',
  address: 'Address',
  copy: 'Copy',
  copied: 'Copied',
  workerRunning: 'Desktop worker is running',
  workerStopped: 'Desktop worker is not running',
  loading: 'Loading state…',
  loadFailed: 'Failed to read state',
  toggleFailed: 'Failed to toggle',
}

export type LocaleKey = keyof typeof zh
