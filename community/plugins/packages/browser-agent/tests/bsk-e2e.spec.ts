/**
 * 真实 bsk 端到端冒烟：走宿主真实的本地子进程 provider 起一个 bsk 会话，
 * 导航、快照、脚本读取，最后确认会话已回收。默认跳过，需 BSK_E2E=1
 * 且本机装有 bsk CLI 与已连接的浏览器扩展。
 */

import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { describe, expect, it } from 'vitest'
import { BskRunner } from '../src/host/bsk.js'
import { countRefs, extractTitle } from '../src/host/snapshot.js'
import { BskSessionStore } from '../src/host/store.js'

const enabled = process.env['BSK_E2E'] === '1'

describe.skipIf(!enabled)('真实 bsk 冒烟', () => {
  it('起会话、导航、快照、读值，并干净结束', async () => {
    const ctx = new Context()
    const runner = new BskRunner(new LocalSubprocessRuntime(ctx), 'bsk', process.cwd(), () => {})
    const store = new BskSessionStore(runner, {
      idleTimeoutMs: 120_000,
      snapshotMaxChars: 20_000,
      browserInstance: process.env['BSK_E2E_BROWSER'] ?? '',
      log: () => {},
    })
    let sessionId: string | undefined
    try {
      const record = await store.ensure('e2e')
      sessionId = record.bskSessionId
      expect(sessionId).toMatch(/^[a-z]{4}$/)

      const navigated = await runner.run(
        ['navigate', 'https://example.com', '--session', sessionId, '--json', '--timeout', '45s'],
        { timeoutMs: 60_000 },
      )
      expect(String(navigated.json?.['reached'])).toBe('load')

      const snapshot = await runner.run(['snapshot', '--session', sessionId, '--json'], { timeoutMs: 30_000 })
      const text = String(snapshot.json?.['text'] ?? '')
      expect(extractTitle(text)).toContain('Example Domain')
      expect(countRefs(text)).toBeGreaterThan(0)

      const evaluated = await runner.run(
        ['evaluate', 'document.title', '--session', sessionId, '--json'],
        { timeoutMs: 30_000 },
      )
      expect(String(evaluated.json?.['value'])).toContain('Example Domain')
    } finally {
      await store.stop('e2e', '冒烟结束')
    }
    expect(store.get('e2e')).toBeUndefined()
    const listed = await runner.run(['session', 'list', '--json'], { timeoutMs: 30_000 })
    expect(JSON.stringify(listed.json ?? {})).not.toContain(sessionId ?? '@@')
    await ctx.fiber.dispose()
  }, 180_000)
})
