import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { Config, toAppConfig, type PluginConfig } from '../../src/harness/pluginConfig.js'

const { close, createApp } = vi.hoisted(() => {
  const close = vi.fn(async (): Promise<void> => undefined)
  const createApp = vi.fn(async () => ({ app: new Hono(), close }))
  return { close, createApp }
})

vi.mock('../../src/app.js', () => ({ createApp }))

const valid: PluginConfig = {
  enabled: true,
  dataDir: '',
  adminToken: 'admin-token',
  webhookToken: 'webhook-token',
  gcpUserKey: 'user-key',
  gcpUrl: 'https://example.invalid/mcp',
  gcpHost: 'promoteart.pm.netease.com',
  popoWebhookUrl: 'https://example.invalid/webhook',
  popoWebhookSecret: '',
  completedStatusId: 6,
  projectIdChannelArt: 7,
  projectIdReturnBusiness: 2001,
  projectIdAiOperations: 2004,
  reviewEnabled: true,
  reviewProvider: '',
  reviewModel: '',
  reviewMaxTokens: 800,
  reviewKnowledgeBase: '提单规范',
  reviewNotificationEnabled: true,
}

function createCtx(): Context {
  return {
    webServer: {
      host: '127.0.0.1',
      register: vi.fn(() => vi.fn()),
    },
    on: vi.fn(() => vi.fn()),
  } as unknown as Context
}

describe('工单插件配置', () => {
  it('默认启用，并映射到业务运行配置', () => {
    const parsed = Config()
    expect(parsed.enabled).toBe(true)
    expect(parsed.completedStatusId).toBe(6)
    expect(parsed.projectIdChannelArt).toBe(7)
    const config = toAppConfig(valid)
    expect(config.adminToken).toBe('admin-token')
    expect(config.projects).toEqual({ 渠道美术: 7, 回流业务: 2001, AI运营活动: 2004 })
    expect(config.gcp.userKey).toBe('user-key')
    expect(config.popo.url).toBe('https://example.invalid/webhook')
    expect(config.review.knowledgeBase).toBe('提单规范')
  })

  it('缺少令牌时拒绝组装运行配置', () => {
    expect(() => toAppConfig({ ...valid, adminToken: '  ' })).toThrow('缺少配置：ADMIN_TOKEN')
  })
})

describe('工单插件生命周期', () => {
  it('关闭 enabled 时不创建运行时，重新启停会卸载', async () => {
    const { WorkorderPluginLifecycle } = await import('../../src/harness/lifecycle.js')
    const ctx = createCtx()
    const lifecycle = new WorkorderPluginLifecycle(ctx)
    await lifecycle.apply({ ...valid, enabled: false })
    expect(createApp).not.toHaveBeenCalled()
    await lifecycle.apply(valid)
    expect(createApp).toHaveBeenCalledOnce()
    expect(ctx.webServer.register).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'prefix',
      path: '/workorder-agent',
    }))
    await lifecycle.apply({ ...valid, enabled: false })
    expect(close).toHaveBeenCalledOnce()
    await lifecycle.stop()
  })
})
