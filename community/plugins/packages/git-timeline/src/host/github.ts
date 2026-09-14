/**
 * GitHub 登录态与提交署名来源。
 *
 * 署名优先读本机 git 配置（identity.ts）；本机还没配署名时，本模块按「gh 优先、
 * Git Credential Manager 兜底」的顺序把它补上：
 *
 * - `gh` 已登录：直接从账号读出 login/name/email（邮箱私密时用 GitHub 官方的
 *   `id+login@users.noreply.github.com`），不需要用户手填。
 * - `gh` 未登录或未安装：用 `git credential fill` 走本机凭据助手（Windows 上是
 *   Git Credential Manager，自带 GitHub OAuth，会打开浏览器完成登录）。凭据由
 *   助手自己落盘（Windows 凭据管理器），本模块只判断成败，**不保存也不回传
 *   token**。
 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { GithubIdentity, GithubStatus } from '../types.js'
import { GIT_TIMEOUT_MS, GIT_NETWORK_TIMEOUT_MS, git, gitConfigEnv } from './run.js'

/** 凭据请求只描述目标主机，不含任何凭据内容。 */
const GITHUB_HOST = 'github.com'

/** `git credential fill` 的 stdin 请求体。 */
const GITHUB_CREDENTIAL_REQUEST = `protocol=https\nhost=${GITHUB_HOST}\n\n`

/** 命令输出的上限：这些都是短输出，凭据响应也只有几百字节。 */
const STDOUT_MAX_BYTES = 64 * 1024

/**
 * 执行一条本机命令。与 `git()` 共用同一套环境补丁，但不假定命令一定是 git
 * （本文件要跑 `gh` 与 `git credential fill`）。
 * @param shell shell 执行器
 * @param cwd 工作目录
 * @param command 完整命令行
 * @param options stdin、超时与额外环境变量
 * @returns stdout 文本
 */
async function runCommand(
  shell: ShellExecutor,
  cwd: string,
  command: string,
  options: { stdin?: string; timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<string> {
  const spec = shell.resolve({
    command,
    workdir: cwd,
    timeoutMs: options.timeoutMs ?? GIT_TIMEOUT_MS,
    stdoutMaxBytes: STDOUT_MAX_BYTES,
    env: { ...gitConfigEnv(), ...options.env },
    ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
  })
  const result = await shell.run(spec)
  if (result.exitCode !== 0) {
    const detail = result.stderr.text.trim() || result.stdout.text.trim() || `退出码 ${String(result.exitCode)}`
    throw new Error(detail)
  }
  return result.stdout.text
}

/** 本机生效的凭据助手名（`--system` 优先，再看全局）；未配置时为 null。 */
async function credentialHelper(shell: ShellExecutor, cwd: string): Promise<string | null> {
  const lookups = [
    ['config', '--system', '--get', 'credential.helper'],
    ['config', '--global', '--get', 'credential.helper'],
  ]
  for (const args of lookups) {
    try {
      const value = (await git(shell, cwd, args)).stdout.trim()
      if (value !== '') return value
    } catch {
      // 未配置该项时 git 以非零退出：继续看下一处。
    }
  }
  return null
}

/** `gh` 的可用性与登录态。 */
async function ghSession(shell: ShellExecutor, cwd: string): Promise<{ installed: boolean; loggedIn: boolean; account: string | null }> {
  try {
    await runCommand(shell, cwd, 'gh --version')
  } catch {
    return { installed: false, loggedIn: false, account: null }
  }
  try {
    await runCommand(shell, cwd, 'gh auth status')
  } catch {
    return { installed: true, loggedIn: false, account: null }
  }
  try {
    const account = JSON.parse(await runCommand(shell, cwd, 'gh api user', { timeoutMs: GIT_NETWORK_TIMEOUT_MS })) as { login?: unknown }
    return { installed: true, loggedIn: true, account: typeof account.login === 'string' ? account.login : null }
  } catch {
    // 离线或 API 失败：登录态仍成立，只是拿不到账号名。
    return { installed: true, loggedIn: true, account: null }
  }
}

/**
 * 读取本机 GitHub 登录态。只描述「装了没有、登录没有、哪个账号、用哪个凭据
 * 助手」，不含任何凭据内容。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 */
export async function readGithubStatus(shell: ShellExecutor, cwd: string): Promise<GithubStatus> {
  const [helper, gh] = await Promise.all([credentialHelper(shell, cwd), ghSession(shell, cwd)])
  return {
    ghInstalled: gh.installed,
    ghLoggedIn: gh.loggedIn,
    account: gh.account,
    credentialHelper: helper,
  }
}

/**
 * 从已登录的 GitHub 账号推导提交署名。邮箱私密时用 GitHub 官方的
 * `id+login@users.noreply.github.com`，避免把真实邮箱写进提交。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @returns 署名；未登录或取不到账号时为 null
 */
export async function readGithubIdentity(shell: ShellExecutor, cwd: string): Promise<GithubIdentity | null> {
  let raw: string
  try {
    raw = await runCommand(shell, cwd, 'gh api user', { timeoutMs: GIT_NETWORK_TIMEOUT_MS })
  } catch {
    return null
  }
  const user = JSON.parse(raw) as { login?: unknown; id?: unknown; name?: unknown; email?: unknown }
  const login = typeof user.login === 'string' ? user.login : null
  if (login === null) return null
  const name = typeof user.name === 'string' && user.name.trim() !== '' ? user.name.trim() : login
  const email = typeof user.email === 'string' && user.email.trim() !== ''
    ? user.email.trim()
    : `${typeof user.id === 'number' ? String(user.id) : '0'}+${login}@users.noreply.github.com`
  return { name, email }
}

/**
 * 触发本机 GitHub 登录：`git credential fill` 在本机没有 github.com 凭据时会让
 * 配置的凭据助手完成认证（Windows 上 GCM 打开浏览器）。凭据由助手自行落盘，
 * 这里的输出一律丢弃。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @returns 登录后的 GitHub 状态
 */
export async function signInWithGithub(shell: ShellExecutor, cwd: string): Promise<GithubStatus> {
  try {
    await runCommand(shell, cwd, 'git credential fill', {
      stdin: GITHUB_CREDENTIAL_REQUEST,
      timeoutMs: GIT_NETWORK_TIMEOUT_MS,
      env: { GIT_TERMINAL_PROMPT: '0' },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`GitHub 登录未完成：${reason}`)
  }
  return await readGithubStatus(shell, cwd)
}
