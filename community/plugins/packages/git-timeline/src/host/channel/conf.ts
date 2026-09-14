/** 读取本机 SSH 配置中与 GitHub 相关的入口，用于给出可执行的建议。 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** SSH 配置里与 GitHub 有关的行。 */
export interface SshConfigHint {
  /** 是否存在 `Host github.com` 这类条目。 */
  hasGithubHost: boolean
  /** 该条目所在行去空白后的文本；没有时为 null。 */
  hostLine: string | null
}

/** SSH 配置路径。 */
function configPath(): string {
  return join(homedir(), '.ssh', 'config')
}

/**
 * 读取 SSH 配置中 GitHub 入口的线索。
 *
 * 只用于把建议说得更具体（「你已经配了」还是「可以按这个配」），
 * 不解析完整配置语义，也不改写任何文件。
 * @returns 线索；读不到配置时两字段都为空值
 */
export async function readSshHint(): Promise<SshConfigHint> {
  try {
    const text = await readFile(configPath(), 'utf8')
    const line = text
      .split('\n')
      .map(entry => entry.trim())
      .find(entry => /^Host\s+.*\bgithub\.com\b/i.test(entry))
    return line === undefined ? { hasGithubHost: false, hostLine: null } : { hasGithubHost: true, hostLine: line }
  } catch {
    // 没有 SSH 配置是正常状态（首次使用的机器就是这样）。
    return { hasGithubHost: false, hostLine: null }
  }
}
