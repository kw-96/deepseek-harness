import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_REVIEW_KNOWLEDGE_BASE } from '../../src/config.js'
import { installAdminRoutes } from '../../src/plugins/admin/routes.js'
import { KnowledgeService } from '../../src/plugins/knowledge/service.js'
import { WorkorderStore } from '../../src/plugins/store/store.js'

const directories: string[] = []
const stores: WorkorderStore[] = []

function database(): WorkorderStore {
  const directory = mkdtempSync(join(tmpdir(), 'knowledge-'))
  directories.push(directory)
  const store = new WorkorderStore(join(directory, 'workorder.sqlite'))
  stores.push(store)
  return store
}

function service(): { service: KnowledgeService; store: WorkorderStore } {
  const store = database()
  const instance = new KnowledgeService(store.knowledge)
  instance.seedIfEmpty()
  return { service: instance, store }
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('提单规范知识库', () => {
  it('首次写入种子条目，重复调用不重复建库', () => {
    const { service: instance } = service()
    const entries = instance.list()
    expect(entries).toHaveLength(5)
    expect(entries[0]).toMatchObject({ title: '适用范围', enabled: true, position: 0 })
    instance.seedIfEmpty()
    expect(instance.list()).toHaveLength(5)
  })

  it('新增、修改、删除与重排条目', () => {
    const { service: instance } = service()
    const created = instance.create({ title: '  渠道要求  ', content: '  回流业务必须填写回流投放渠道  ', enabled: true })
    expect(created).toMatchObject({ title: '渠道要求', content: '回流业务必须填写回流投放渠道', enabled: true })

    const updated = instance.update(created.id, { title: '渠道要求', content: '已修订正文', enabled: false })
    expect(updated).toMatchObject({ content: '已修订正文', enabled: false })

    instance.reorder([created.id])
    expect(instance.list()[0]?.id).toBe(created.id)

    instance.remove(created.id)
    expect(instance.list().some((item) => item.id === created.id)).toBe(false)
    expect(() => instance.remove(created.id)).toThrow('知识条目不存在')
  })

  it('拒绝空标题、空正文与超长内容', () => {
    const { service: instance } = service()
    expect(() => instance.create({ title: '  ', content: 'x', enabled: true })).toThrow('条目标题不能为空')
    expect(() => instance.create({ title: 't', content: '  ', enabled: true })).toThrow('条目正文不能为空')
    expect(() => instance.create({ title: 't'.repeat(121), content: 'x', enabled: true })).toThrow('条目标题不能超过 120 字')
    expect(() => instance.create({ title: 't', content: 'x'.repeat(2001), enabled: true })).toThrow('条目正文不能超过 2000 字')
  })

  it('合成审核文本：只取启用条目、按位置、逐条一行；全停用时回退默认规范', () => {
    const { service: instance } = service()
    const first = instance.list()[0]
    expect(instance.compose().split('\n')[0]).toBe(`- ${first?.content}`)

    instance.update(first!.id, { title: first!.title, content: first!.content, enabled: false })
    expect(instance.compose()).not.toContain(`- ${first!.content}`)

    for (const entry of instance.list()) {
      instance.update(entry.id, { title: entry.title, content: entry.content, enabled: false })
    }
    expect(instance.compose()).toBe(DEFAULT_REVIEW_KNOWLEDGE_BASE)
  })

  it('管理接口支持增删改与排序，并在变更后重置后台 Agent', async () => {
    const { service: instance, store } = service()
    const app = new Hono()
    const reset = vi.fn()
    installAdminRoutes(app, {
      config: {
        port: 3081, dataDir: '', webhookToken: 'webhook',
        webhookIngress: { enabled: false, host: '127.0.0.1', port: 3091 },
        projects: { 渠道美术: 7, 回流业务: 2001, AI运营活动: 2004 }, completedStatusId: 6,
        gcp: { url: 'https://example.invalid/mcp', host: 'gcp.example.com', userKey: 'key' },
        popo: { app: { id: 'app', secret: 'secret', receiver: 'a@corp.netease.com' } },
        review: { enabled: false, maxTokens: 800, knowledgeBase: '规范', notificationEnabled: false },
        vivo: { projectDir: '', python: 'python', script: 'save_egg_party.py', defaultTargets: '蛋仔派对' },
      },
      store, issues: {} as never, delivery: {} as never, workflow: {} as never, review: {} as never,
      stats: {} as never, knowledge: instance, vivo: {} as never,
      webhookLog: { list: () => [], record: vi.fn() } as never,
      agentRouter: { reviewIssue: vi.fn(), reset } as never,
    } as never)

    const created = await app.request('/api/admin/knowledge', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '新增规则', content: '内容', enabled: true }),
    })
    expect(created.status).toBe(200)
    const body = await created.json() as { entry: { id: string }; items: unknown[] }
    expect(body.items).toHaveLength(6)

    const listed = await app.request('/api/admin/knowledge')
    expect((await listed.json() as { items: unknown[] }).items).toHaveLength(6)

    const updated = await app.request(`/api/admin/knowledge/${body.entry.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '新增规则', content: '内容2', enabled: false }),
    })
    expect(updated.status).toBe(200)

    const reordered = await app.request('/api/admin/knowledge/reorder', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [body.entry.id] }),
    })
    expect(reordered.status).toBe(200)

    const removed = await app.request(`/api/admin/knowledge/${body.entry.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(200)
    expect(reset).toHaveBeenCalled()

    const invalid = await app.request('/api/admin/knowledge', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '', content: '', enabled: true }),
    })
    expect(invalid.status).toBe(400)
  })
})
