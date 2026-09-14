/** 通道界面的公共替身（与主面板用例同源，避免各写一份）。 */

import { vi } from 'vitest'
import type { GitChannelStatus } from '../../src/types.js'
import type { GitPanelApi, TFn } from '../../src/client/lib/faces.js'
import { zh } from '../../src/client/lib/locales.js'

/** 文案函数：直接读中文词典，缺失键回落到键名。 */
export const t: TFn = (key, params) => {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template,
  )
}

/** 一个处于 Git 仓库中的会话选择器。 */
export const sessions = (): { current: string; byId: Record<string, { cwd: string }> } =>
  ({ current: 's1', byId: { s1: { cwd: 'E:/repo' } } })

/** 一份「HTTPS 被阻断、SSH 可用」的通道状态。 */
export const blockedStatus: GitChannelStatus = {
  protocol: 'https',
  remoteName: 'origin',
  remoteUrl: 'https://github.com/kw-96/deepseek-harness.git',
  https: { tlsOk: true, httpOk: false, status: null, latencyMs: 200, error: 'timeout' },
  ssh: { port22: true, port443: true },
  advice: 'use-ssh',
  sshUrl: 'git@github.com:kw-96/deepseek-harness.git',
  note: 'HTTPS 通道被阻断（TLS 可握手但收不到响应），但 SSH 通道可用；改用 SSH 远程即可正常拉取与推送',
}

/** 一份「通道正常」的状态。 */
export const okStatus: GitChannelStatus = {
  ...blockedStatus,
  https: { tlsOk: true, httpOk: true, status: 'HTTP/1.1 200 OK', latencyMs: 210, error: null },
  advice: 'ok',
  note: 'HTTPS 通道正常，网络操作可直接进行',
}

/**
 * 面板 API 替身：只需要渲染底部栏所需的方法，其余按需覆盖。
 * @param over 需要覆盖的方法
 * @returns 面板 API
 */
export function api(over: Partial<GitPanelApi> = {}): GitPanelApi {
  return {
    status: vi.fn(async () => ({
      repo: true, root: 'E:/repo', error: null, branch: 'dev', upstream: 'origin/dev',
      ahead: 1, behind: 0, staged: [], changes: [],
    })),
    log: vi.fn(async () => ({ repo: true, root: 'E:/repo', error: null, entries: [] })),
    identity: vi.fn(async () => ({ name: 'dev', email: 'dev@example.test', origin: 'C:/Users/x/.gitconfig' })),
    channelStatus: vi.fn(async () => okStatus),
    switchRemote: vi.fn(async () => ({ url: 'git@github.com:kw-96/deepseek-harness.git', detail: '' })),
    ...over,
  } as GitPanelApi
}
