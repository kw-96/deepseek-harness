/** Locale dictionary for the codex-shell plugin UI（底栏多 tab 终端）。 */

export const zh = {
  bottomTerminal: '终端',
  bottomTerminalClose: '关闭终端面板',
  bottomTerminalCloseTab: '关闭标签',
  bottomTerminalNew: '新建终端',
  bottomTerminalPwsh: 'PowerShell',
  bottomTerminalBash: 'Bash',
  bottomTerminalAgent: 'Agent',
  bottomTerminalStarting: '正在启动终端…',
  bottomTerminalNeedAgent: '终端需要当前会话的 live Agent。',
  bottomTerminalEmpty: '没有打开的终端标签。点 + 新建，或等待 Agent 打开会话。',
  bottomTerminalBusy: '模型正在占用此终端，稍后再键入。',
} as const

export type LocaleKey = keyof typeof zh

export const en: Record<LocaleKey, string> = {
  bottomTerminal: 'Terminal',
  bottomTerminalClose: 'Close terminal panel',
  bottomTerminalCloseTab: 'Close tab',
  bottomTerminalNew: 'New terminal',
  bottomTerminalPwsh: 'PowerShell',
  bottomTerminalBash: 'Bash',
  bottomTerminalAgent: 'Agent',
  bottomTerminalStarting: 'Starting terminal…',
  bottomTerminalNeedAgent: 'The terminal needs a live Agent for the current session.',
  bottomTerminalEmpty: 'No open terminal tabs. Use + to create one, or wait for the Agent.',
  bottomTerminalBusy: 'The model is using this terminal; try typing again shortly.',
}
