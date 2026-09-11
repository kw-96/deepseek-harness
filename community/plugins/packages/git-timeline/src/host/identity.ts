/** Git 身份：读取生效署名与来源，并支持写入。 */

import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { GitActionResponse, GitIdentity } from '../types.js'
import { git, repoRoot } from './run.js'

/** 一条 `--show-origin` 输出拆成「值 + 来源文件」。 */
function splitOrigin(line: string): { value: string | null; origin: string | null } {
  const tab = line.indexOf('\t')
  if (tab < 0) return { value: line === '' ? null : line, origin: null }
  const origin = line.slice(0, tab).replace(/^file:/, '')
  const value = line.slice(tab + 1).trim()
  return { value: value === '' ? null : value, origin: origin === '' ? null : origin }
}

/**
 * 读取一项 git 配置及其来源文件。
 *
 * `--show-origin` 让界面能说明「这条署名来自哪个配置文件」，也便于排查
 * 为什么换了个执行环境就读不到用户级配置。
 */
async function readConfig(shell: ShellExecutor, cwd: string, key: string): Promise<{ value: string | null; origin: string | null }> {
  try {
    const out = await git(shell, cwd, ['config', '--show-origin', '--get', key])
    const line = out.stdout.split('\n').map(text => text.trim()).find(text => text !== '') ?? ''
    return splitOrigin(line)
  } catch {
    return { value: null, origin: null }
  }
}

/** 解析 `git var GIT_COMMITTER_IDENT` 的输出（`Name <email> 时间 时区`）。 */
export function parseIdent(text: string): { name: string | null; email: string | null } {
  const match = /^(.*?)\s*<([^>]*)>/.exec(text.trim())
  if (match === null) return { name: null, email: null }
  const name = (match[1] ?? '').trim()
  const email = (match[2] ?? '').trim()
  return { name: name === '' ? null : name, email: email === '' ? null : email }
}

/**
 * 读取生效的 git 身份。
 *
 * 先按配置项读取（能拿到来源文件）；两者都为空时再问一次 git 自己会用的
 * 署名（`git var GIT_COMMITTER_IDENT`），以覆盖只写了其中一个键的情况。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 */
export async function readIdentity(shell: ShellExecutor, cwd: string): Promise<GitIdentity> {
  const name = await readConfig(shell, cwd, 'user.name')
  const email = await readConfig(shell, cwd, 'user.email')
  if (name.value !== null || email.value !== null) {
    return { name: name.value, email: email.value, origin: name.origin ?? email.origin }
  }
  try {
    const out = await git(shell, cwd, ['var', 'GIT_COMMITTER_IDENT'])
    const ident = parseIdent(out.stdout)
    return { name: ident.name, email: ident.email, origin: null }
  } catch {
    // 未配置署名时 `git var` 以非零退出：这正是「未配置」的正常信号。
    return { name: null, email: null, origin: null }
  }
}

/**
 * 写入 git 身份。
 * @param shell shell 执行器
 * @param cwd 会话工作目录
 * @param name 署名（非空）
 * @param email 邮箱（非空）
 * @param scope `global` 写用户级配置，`local` 只写当前仓库
 */
export async function writeIdentity(
  shell: ShellExecutor,
  cwd: string,
  name: string,
  email: string,
  scope: 'global' | 'local',
): Promise<GitActionResponse> {
  const root = await repoRoot(shell, cwd)
  if (root === null) throw new Error('当前工作区不是 Git 仓库')
  const trimmedName = name.trim()
  const trimmedEmail = email.trim()
  if (trimmedName === '') throw new Error('姓名不能为空')
  if (trimmedEmail === '') throw new Error('邮箱不能为空')
  const flag = scope === 'local' ? '--local' : '--global'
  await git(shell, root, ['config', flag, 'user.name', trimmedName])
  await git(shell, root, ['config', flag, 'user.email', trimmedEmail])
  return { detail: `${trimmedName} <${trimmedEmail}>` }
}
