import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'

const root = resolve(import.meta.dirname, '../..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dsh?: { bundle?: { patch?: string } }
}

function bundleEntries(): ReturnType<typeof composeEntries> {
  return composeEntries([loadOverlayPatches('workorder-agent', resolve(root, 'cordis.patch.yml'))])
}

describe('DeepSeek Harness 自研 Bundle', () => {
  it('声明当前 Harness 可识别的 Bundle manifest', () => {
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
  })

  it('组合可热拔插的 Host 插件与准确默认配置', () => {
    const entries = bundleEntries()
    const host = entries.find((entry) => entry.id === 'workorder-agent-host')
    expect(host).toMatchObject({ name: 'workorder-agent', inject: ['webServer', 'agents', 'skills'] })
    expect(host?.config).toMatchObject({ enabled: true })
    const configKeys = Object.keys(host?.config ?? {})
    for (const key of ['dataDir', 'adminToken', 'webhookToken', 'gcpUserKey', 'gcpUrl', 'gcpHost',
      'popoWebhookUrl', 'popoWebhookSecret', 'completedStatusId',
      'projectIdChannelArt', 'projectIdReturnBusiness', 'projectIdAiOperations']) {
      expect(configKeys).toContain(key)
    }
    const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("'https://mcp.netease.com/servers/gcp/mcp'")
    expect(patch).toContain("'promoteart.pm.netease.com'")
  })

  it('使用官方 Agent、Skill、WebServer 与设置服务', () => {
    const hostSource = readFileSync(resolve(root, 'src/harness/host.ts'), 'utf8')
    const lifecycleSource = readFileSync(resolve(root, 'src/harness/lifecycle.ts'), 'utf8')
    const agentSource = readFileSync(resolve(root, 'src/harness/agent.ts'), 'utf8')
    const skillSource = readFileSync(resolve(root, 'src/harness/skill.ts'), 'utf8')
    expect(hostSource).not.toContain('tools.execute')
    expect(hostSource).not.toContain('ctx.jobs')
    expect(hostSource).not.toContain('tapIndex')
    expect(lifecycleSource).not.toContain('tapIndex')
    expect(hostSource).toContain('WORKORDER_SETTINGS_NS')
    expect(hostSource).toContain('settings.installSection')
    expect(lifecycleSource).toContain('webserver/index-inject')
    expect(lifecycleSource).toContain('ctx.webServer.register')
    expect(agentSource).toContain('ctx.agents.create')
    expect(agentSource).toContain('ctx.agents.get')
    expect(skillSource).toContain('agentCtx.skills.register')
  })
})
