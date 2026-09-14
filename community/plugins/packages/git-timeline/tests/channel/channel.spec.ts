/**
 * 通道纯函数：协议归类、地址脱敏、HTTPS↔SSH 转换与建议判定。
 */

import { describe, expect, it } from 'vitest'
import { classifyRemote, maskRemoteUrl, toHttpsUrl, toSshUrl } from '../../src/host/channel/remote.js'
import { decideAdvice } from '../../src/host/channel/status.js'
import type { HttpsChannel, SshChannel } from '../../src/host/channel/types.js'

const HTTPS_BLOCKED: HttpsChannel = { tlsOk: true, httpOk: false, status: null, latencyMs: 200, error: 'timeout' }
const HTTPS_OK: HttpsChannel = { tlsOk: true, httpOk: true, status: 'HTTP/1.1 200 OK', latencyMs: 210, error: null }
const SSH_OK: SshChannel = { port22: true, port443: true }
const SSH_DOWN: SshChannel = { port22: false, port443: false }

describe('远程协议归类', () => {
  it('识别 HTTPS、SSH 与其它形态', () => {
    expect(classifyRemote('https://github.com/owner/repo.git')).toBe('https')
    expect(classifyRemote('http://github.com/owner/repo.git')).toBe('https')
    expect(classifyRemote('git@github.com:owner/repo.git')).toBe('ssh')
    expect(classifyRemote('ssh://git@github.com/owner/repo.git')).toBe('ssh')
    expect(classifyRemote('git://github.com/owner/repo.git')).toBe('other')
    expect(classifyRemote('')).toBe('other')
  })
})

describe('远程地址脱敏', () => {
  it('去掉密码但保留其余部分', () => {
    expect(maskRemoteUrl('https://user:secret@github.com/owner/repo.git'))
      .toBe('https://user@github.com/owner/repo.git')
    expect(maskRemoteUrl('https://x-access-token:ghp_secret@github.com/o/r.git'))
      .toBe('https://x-access-token@github.com/o/r.git')
  })

  it('解析不了的 scp 形态原样返回（它本身不带密码）', () => {
    expect(maskRemoteUrl('git@github.com:owner/repo.git')).toBe('git@github.com:owner/repo.git')
  })
})

describe('HTTPS ↔ SSH 转换', () => {
  it('把 GitHub 的 HTTPS 地址转成 SSH 形态', () => {
    expect(toSshUrl('https://github.com/kw-96/deepseek-harness.git'))
      .toBe('git@github.com:kw-96/deepseek-harness.git')
    expect(toSshUrl('https://github.com/owner/repo')).toBe('git@github.com:owner/repo')
  })

  it('已是 SSH 形态时保持不变', () => {
    expect(toSshUrl('git@github.com:owner/repo.git')).toBe('git@github.com:owner/repo.git')
  })

  it('非 GitHub 地址不臆造 SSH 地址', () => {
    expect(toSshUrl('https://gitlab.com/owner/repo.git')).toBeNull()
    expect(toSshUrl('')).toBeNull()
  })

  it('把 SSH 形态转回 HTTPS', () => {
    expect(toHttpsUrl('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo.git')
    expect(toHttpsUrl('ssh://git@github.com/owner/repo.git')).toBe('https://github.com/owner/repo.git')
  })

  it('往返转换保持仓库指向不变', () => {
    const original = 'https://github.com/kw-96/deepseek-harness.git'
    const ssh = toSshUrl(original)
    expect(ssh).not.toBeNull()
    expect(toHttpsUrl(ssh ?? '')).toBe('https://github.com/kw-96/deepseek-harness.git')
  })
})

describe('建议判定', () => {
  it('HTTPS 可用时无需动作', () => {
    expect(decideAdvice('https', HTTPS_OK, SSH_DOWN)).toBe('ok')
  })

  it('HTTPS 被阻断而 SSH 可用时建议改用 SSH', () => {
    expect(decideAdvice('https', HTTPS_BLOCKED, SSH_OK)).toBe('use-ssh')
    expect(decideAdvice('https', HTTPS_BLOCKED, { port22: true, port443: false })).toBe('use-ssh')
    expect(decideAdvice('https', HTTPS_BLOCKED, { port22: false, port443: true })).toBe('use-ssh')
  })

  it('两种通道都不可用时如实报告无通道', () => {
    expect(decideAdvice('https', HTTPS_BLOCKED, SSH_DOWN)).toBe('no-channel')
    expect(decideAdvice('ssh', HTTPS_BLOCKED, SSH_DOWN)).toBe('no-channel')
  })

  it('已走 SSH 且通道可用时视为正常', () => {
    expect(decideAdvice('ssh', HTTPS_BLOCKED, SSH_OK)).toBe('ok')
  })

  it('没有远程时不建议切换', () => {
    expect(decideAdvice('other', HTTPS_BLOCKED, SSH_OK)).toBe('no-remote')
  })
})
