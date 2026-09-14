/**
 * 真实环境下的通道判定：直接跑面板用的探测逻辑，确认它对当前网络给出
 * 可执行建议（本机实测 HTTPS 被阻断、SSH 可用时应建议改用 SSH）。
 */

import { describe, expect, it } from 'vitest'
import { probeGitHttps, probeSsh } from '../../src/host/channel/probe.js'
import { decideAdvice } from '../../src/host/channel/status.js'

describe('真实网络下的建议判定（需要外网）', () => {
  it('探测结果能推出明确建议，且不会在 HTTPS 不通时谎报 ok', async () => {
    const [https, ssh] = await Promise.all([probeGitHttps(6000), probeSsh(6000)])
    const advice = decideAdvice('https', https, ssh)

    // 无论网络状况如何，建议都必须是这两个可执行结论之一。
    expect(['ok', 'use-ssh', 'no-channel']).toContain(advice)

    if (!https.httpOk) {
      // HTTPS 拿不到响应时绝不能判成 ok；有 SSH 就必须建议改用 SSH。
      expect(advice).not.toBe('ok')
      if (ssh.port22 || ssh.port443) expect(advice).toBe('use-ssh')
      else expect(advice).toBe('no-channel')
    } else {
      expect(advice).toBe('ok')
    }

    // 探测必须给出可解释的细节，供界面显示原因。
    expect(typeof https.tlsOk).toBe('boolean')
    if (!https.httpOk) expect(https.error).not.toBeNull()
  }, 30_000)
})
