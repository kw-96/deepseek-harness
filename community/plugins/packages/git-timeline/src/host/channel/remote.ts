/** 远程仓库：读取协议、在 HTTPS 与 SSH 形态之间转换地址并切换。 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { GitSwitchResult, RemoteInfo, RemoteProtocol } from '../../channel.js'
import { git, lastLine, repoRoot } from '../run.js'

/**
 * 归类远程 URL 的传输协议。
 *
 * 覆盖 `https://`、`http://`、`git://`、`ssh://` 与 scp 形态
 * （`git@github.com:owner/repo.git`）——最后一种没有协议前缀，只能按
 * 「user@host:path」的形态识别。
 * @param url 远程地址
 * @returns 协议归类
 */
export function classifyRemote(url: string): RemoteProtocol {
  const text = url.trim()
  if (text === '') return 'other'
  if (/^https?:\/\//i.test(text)) return 'https'
  if (/^ssh:\/\//i.test(text)) return 'ssh'
  // scp 形态：user@host:path（冒号后不能是 `//`，否则是 URL 的 scheme）。
  if (/^[^/@\s]+@[^/\s:]+:[^/]/.test(text)) return 'ssh'
  return 'other'
}

/**
 * 隐去 URL 中的凭据。
 *
 * 面板会把远程地址显示给用户，而 HTTPS 地址里可能带着用户名与令牌
 * （`https://x-access-token:ghp_xxx@host/...`），这类内容不随界面外传。
 * 带凭据的写法都能被 URL 解析并剥离密码；解析不了的是 `git@host:path`
 * 形态，它本身没有密码可剥。
 * @param url 远程地址
 * @returns 去掉密码后的地址
 */
export function maskRemoteUrl(url: string): string {
  const text = url.trim()
  if (text === '') return ''
  try {
    const parsed = new URL(text)
    if (parsed.password !== '') parsed.password = ''
    return parsed.toString()
  } catch {
    return text
  }
}

/**
 * 把远程地址转成 SSH 形态。
 *
 * GitHub 的两种形态一一对应，这里只做形态改写，不改变指向的仓库。
 * @param url 现有远程地址
 * @returns SSH 形态地址；无法识别或不是 GitHub 地址时为 null
 */
export function toSshUrl(url: string): string | null {
  const text = url.trim()
  if (text === '') return null
  if (classifyRemote(text) === 'ssh') return text
  try {
    const parsed = new URL(text)
    if (!/(^|\.)github\.com$/i.test(parsed.hostname)) return null
    const path = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '')
    if (!path.includes('/')) return null
    return `git@github.com:${path}`
  } catch {
    return null
  }
}

/**
 * 把远程地址转回 HTTPS 形态。
 * @param url 现有远程地址
 * @returns HTTPS 形态地址；无法识别时为 null
 */
export function toHttpsUrl(url: string): string | null {
  const text = url.trim()
  if (text === '') return null
  const scp = /^[^/@\s]+@([^/\s:]+):(.+)$/.exec(text)
  if (scp !== null) {
    const host = scp[1] ?? ''
    const path = (scp[2] ?? '').replace(/^\/+/, '')
    return `https://${host}/${path}`
  }
  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'ssh:') return null
    const path = parsed.pathname.replace(/^\/+/, '')
    return `https://${parsed.hostname}/${path}`
  } catch {
    return null
  }
}

/**
 * 读取当前仓库的首个远程及其协议。
 * @param shell shell 执行器
 * @param root 仓库根目录
 * @returns 远程名称、脱敏地址与协议
 */
export async function readRemote(shell: ShellExecutor, root: string): Promise<RemoteInfo> {
  const empty: RemoteInfo = { name: null, url: null, protocol: 'other' }
  try {
    const names = await git(shell, root, ['remote'])
    const name = names.stdout.split('\n').map(line => line.trim()).find(line => line !== '')
    if (name === undefined) return empty
    const url = await git(shell, root, ['remote', 'get-url', name])
    const raw = url.stdout.trim().split('\n')[0]?.trim() ?? ''
    return { name, url: maskRemoteUrl(raw), protocol: classifyRemote(raw) }
  } catch {
    // 没有远程的仓库是正常状态，不作为错误上报。
    return empty
  }
}

/**
 * 把远程地址切换到另一种传输形态。
 *
 * 这是唯一写仓库配置的网络动作，且只在用户显式点击时执行。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @param target 目标形态
 * @returns 切换后的地址与说明
 */
export async function switchRemote(
  shell: ShellExecutor,
  cwd: string,
  target: 'ssh' | 'https',
): Promise<GitSwitchResult> {
  const root = await repoRoot(shell, cwd)
  if (root === null) throw new Error('当前工作区不是 Git 仓库')
  const remote = await readRemote(shell, root)
  if (remote.name === null || remote.url === null) throw new Error('当前仓库没有远程')
  const current = await git(shell, root, ['remote', 'get-url', remote.name])
  const raw = current.stdout.trim().split('\n')[0]?.trim() ?? ''
  const next = target === 'ssh' ? toSshUrl(raw) : toHttpsUrl(raw)
  if (next === null) throw new Error(target === 'ssh' ? '无法从当前地址推导 SSH 地址' : '无法从当前地址推导 HTTPS 地址')
  const out = await git(shell, root, ['remote', 'set-url', remote.name, next])
  return { url: maskRemoteUrl(next), detail: lastLine(out.stderr) || `已切换为 ${maskRemoteUrl(next)}` }
}
