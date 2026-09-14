/** 通道状态：探测 HTTPS 与 SSH 通道，给出可执行的建议。 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { ChannelAdvice, GitChannelStatus, HttpsChannel, RemoteProtocol, SshChannel } from '../../channel.js'
import { readSshHint } from './conf.js'
import { probeGitHttps, probeSsh } from './probe.js'
import { readRemote, toSshUrl } from './remote.js'
import { repoRoot } from '../run.js'

/** 探测失败时使用的空结果。 */
const UNKNOWN_HTTPS: HttpsChannel = { tlsOk: false, httpOk: false, status: null, latencyMs: null, error: 'skipped' }
const UNKNOWN_SSH: SshChannel = { port22: false, port443: false }

/**
 * 决定建议的下一步。
 * @param protocol 当前远程协议
 * @param https HTTPS 探测结果
 * @param ssh SSH 探测结果
 * @returns 建议
 */
export function decideAdvice(protocol: RemoteProtocol, https: HttpsChannel, ssh: SshChannel): ChannelAdvice {
  if (protocol === 'ssh') {
    return ssh.port22 || ssh.port443 ? 'ok' : 'no-channel'
  }
  if (protocol !== 'https') return 'no-remote'
  if (https.httpOk) return 'ok'
  return ssh.port22 || ssh.port443 ? 'use-ssh' : 'no-channel'
}

/**
 * 生成面向用户的说明。
 * @param advice 建议
 * @param https HTTPS 探测结果
 * @param sshHint SSH 配置线索
 * @returns 中文说明
 */
function noteFor(advice: ChannelAdvice, https: HttpsChannel, sshHint: boolean): string {
  switch (advice) {
    case 'ok':
      return https.httpOk ? 'HTTPS 通道正常，网络操作可直接进行' : 'SSH 通道正常'
    case 'use-ssh':
      return 'HTTPS 通道被阻断（TLS 可握手但收不到响应），但 SSH 通道可用；改用 SSH 远程即可正常拉取与推送'
    case 'no-channel':
      return sshHint ? 'HTTPS 与 SSH 通道都不可用，请检查网络或代理设置' : 'HTTPS 与 SSH 通道都不可用，请检查网络设置'
    case 'no-remote':
      return '当前仓库没有可用的 GitHub 远程'
    default:
      return '当前工作区不是 Git 仓库'
  }
}

/**
 * 探测并组装当前仓库的网络通道状态。
 *
 * 探测结果直接来自真实的 TLS 请求与 TCP 连接，不依赖任何加速程序，
 * 也不写入仓库配置。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @returns 面板展示用的通道状态
 */
export async function buildChannelStatus(shell: ShellExecutor, cwd: string): Promise<GitChannelStatus> {
  const root = await repoRoot(shell, cwd)
  if (root === null) {
    return {
      protocol: 'other', remoteName: null, remoteUrl: null, https: UNKNOWN_HTTPS, ssh: UNKNOWN_SSH,
      advice: 'not-repo', sshUrl: null, note: noteFor('not-repo', UNKNOWN_HTTPS, false),
    }
  }
  const remote = await readRemote(shell, root)
  if (remote.protocol === 'ssh') {
    const ssh = await probeSsh()
    const advice = decideAdvice('ssh', UNKNOWN_HTTPS, ssh)
    return {
      protocol: 'ssh', remoteName: remote.name, remoteUrl: remote.url, https: UNKNOWN_HTTPS, ssh,
      advice, sshUrl: remote.url, note: noteFor(advice, UNKNOWN_HTTPS, false),
    }
  }
  if (remote.protocol !== 'https') {
    const advice = decideAdvice(remote.protocol, UNKNOWN_HTTPS, UNKNOWN_SSH)
    return {
      protocol: remote.protocol, remoteName: remote.name, remoteUrl: remote.url,
      https: UNKNOWN_HTTPS, ssh: UNKNOWN_SSH, advice, sshUrl: null, note: noteFor(advice, UNKNOWN_HTTPS, false),
    }
  }
  const [https, ssh, hint] = await Promise.all([probeGitHttps(), probeSsh(), readSshHint()])
  const advice = decideAdvice('https', https, ssh)
  const sshUrl = remote.url === null ? null : toSshUrl(remote.url)
  return {
    protocol: 'https', remoteName: remote.name, remoteUrl: remote.url, https, ssh, advice, sshUrl,
    note: noteFor(advice, https, hint.hasGithubHost),
  }
}
