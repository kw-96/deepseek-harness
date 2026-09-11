import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectMap } from '../../src/plugins/gcp/service.js'
import { GcpWebhookHandler } from '../../src/plugins/webhook/handler.js'
import { startWebhookIngress, type WebhookIngress } from '../../src/plugins/webhook/ingress.js'
import { WebhookRequestLog } from '../../src/plugins/webhook/log.js'
import { WorkorderStore } from '../../src/plugins/store/store.js'

const directories: string[] = []
const ingresses: WebhookIngress[] = []
const projects: ProjectMap = { 渠道美术: 7, 回流业务: 2001, AI运营活动: 2004 }
const instanceHost = 'promoteart.pm.netease.com'
const token = 'test-token'

function database(): WorkorderStore {
  const directory = mkdtempSync(join(tmpdir(), 'workorder-ingress-'))
  directories.push(directory)
  return new WorkorderStore(join(directory, 'workorder.sqlite'))
}

/** 构造事件处理器；事件接收路径不需要 MCP 连接与审核工作流。 */
function handler(store: WorkorderStore): GcpWebhookHandler {
  return new GcpWebhookHandler(store, {} as never, projects, instanceHost, {} as never, 6)
}

/** 启动独立入口并登记，便于用例结束后统一释放。 */
async function startIngress(store: WorkorderStore, port = 0): Promise<{ ingress: WebhookIngress; log: WebhookRequestLog }> {
  const log = new WebhookRequestLog()
  const ingress = await startWebhookIngress(handler(store), { host: '127.0.0.1', port, token, log })
  ingresses.push(ingress)
  return { ingress, log }
}

/** 易协作真实载荷：事件对象在 data 下，作者与 instance 在顶层。 */
function payload(): Record<string, unknown> {
  return {
    trace_id: 'trace-1',
    instance: { domain: instanceHost, id: 2206 },
    data: { issue: { id: 101, project: { id: 7 }, author: { name: '提交人' } } },
    author: { name: '提交人' },
    module: 'issue',
    event: 'create',
  }
}

afterEach(async () => {
  for (const ingress of ingresses.splice(0)) await ingress.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('独立易协作事件入口', () => {
  it('接收新建工单事件并持久入队', async () => {
    const store = database()
    const { ingress, log } = await startIngress(store)
    const response = await fetch(`http://127.0.0.1:${ingress.port}/webhooks/gcp/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload()),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ accepted: true, duplicate: false, issueId: 101 })
    expect(store.listWebhooks()).toHaveLength(1)
    expect(log.list()[0]).toMatchObject({ source: 'ingress', outcome: 'accepted', issueId: 101, projectId: 7 })
    store.close()
  })

  it('只服务事件路径：令牌不符或路径不符一律 404', async () => {
    const store = database()
    const { ingress, log } = await startIngress(store)
    const base = `http://127.0.0.1:${ingress.port}`
    const wrongToken = await fetch(`${base}/webhooks/gcp/other`, { method: 'POST', body: '{}' })
    const wrongPath = await fetch(`${base}/api/admin/status`)
    expect(wrongToken.status).toBe(404)
    expect(wrongPath.status).toBe(404)
    expect(log.list()).toHaveLength(0)
    store.close()
  })

  it('记录被忽略的事件及其原因，便于区分「没到达」与「到了被忽略」', async () => {
    const store = database()
    const { ingress, log } = await startIngress(store)
    const url = `http://127.0.0.1:${ingress.port}/webhooks/gcp/${token}`
    const post = (body: unknown): Promise<Response> => fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    expect(await post({ ...payload(), event: 'update' })).toMatchObject({ status: 200 })
    expect(await post({ ...payload(), data: { issue: { id: 101, project: { id: 999 } } } })).toMatchObject({ status: 200 })
    expect(await post({ ...payload(), trace_id: '' })).toMatchObject({ status: 200 })
    const entries = log.list()
    expect(entries).toHaveLength(3)
    expect(entries[0]?.reason).toContain('缺少 trace_id')
    expect(entries[1]?.reason).toContain('项目不在白名单')
    expect(entries[2]?.reason).toContain('未把状态改为')
    expect(entries[0]?.bodyPreview).toContain('"trace_id":""')
    expect(entries[1]?.projectId).toBe(999)
    expect(store.listWebhooks()).toHaveLength(0)
    store.close()
  })

  it('记录非法请求体', async () => {
    const store = database()
    const { ingress, log } = await startIngress(store)
    const response = await fetch(`http://127.0.0.1:${ingress.port}/webhooks/gcp/${token}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not-json',
    })
    expect(response.status).toBe(400)
    expect(log.list()[0]).toMatchObject({ outcome: 'invalid', reason: '请求体不是合法 JSON' })
    store.close()
  })

  it('编辑事件仅在状态改为「美术完成」时入队，其余编辑忽略', async () => {
    const store = database()
    const { ingress, log } = await startIngress(store)
    const post = (body: unknown): Promise<Response> => fetch(`http://127.0.0.1:${ingress.port}/webhooks/gcp/${token}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    const completed = {
      ...payload(), event: 'update',
      data: {
        issue: {
          id: 303, project: { id: 7 },
          changes: [{ prop_key: 'status_id', property: 'attr', old_value: 1, value: 6 }],
        },
      },
    }
    expect(await (await post(completed)).json()).toMatchObject({ accepted: true, issueId: 303 })
    const other = {
      ...payload(), event: 'update',
      data: {
        issue: {
          id: 303, project: { id: 7 },
          changes: [{ prop_key: 'status_id', property: 'attr', old_value: 6, value: 26 }],
        },
      },
    }
    expect(await (await post(other)).json()).toMatchObject({ accepted: false })
    expect(store.listWebhooks()).toHaveLength(1)
    expect(log.list()[0]?.reason).toContain('未把状态改为')
    store.close()
  })

  it('编辑事件缺少项目时回退到本地快照归属', async () => {
    const store = database()
    store.issues.upsert({
      id: 404, projectName: '回流业务', subject: '测试工单', submitterName: '提单人',
      assigneeName: '设计师', statusName: '美术完成',
      gameProduct: '测试游戏', expectedDeliveryDate: '2026-09-09', artCategory: '子单',
      deliveryChannel: '', returnDeliveryChannel: '', aiDeliveryChannel: '', aiPipelineTime: '是',
      totalHours: 1, designQuantity: 1, startDate: '', dueDate: '', createdOn: '', updatedOn: '', closedOn: '',
    })
    const { ingress } = await startIngress(store)
    const response = await fetch(`http://127.0.0.1:${ingress.port}/webhooks/gcp/${token}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...payload(), event: 'update',
        data: { issue: { id: 404, changes: [{ prop_key: 'status_id', value: 6 }] } },
      }),
    })
    expect(await response.json()).toMatchObject({ accepted: true, issueId: 404 })
    expect(store.listWebhooks()[0]).toMatchObject({ issueId: 404, projectId: 2001 })
    store.close()
  })

  it('兼容工单位于顶层的旧载荷形态', async () => {
    const store = database()
    const { ingress } = await startIngress(store)
    const flat = { ...payload(), data: undefined, issue: { id: 202, project: { id: 2001 } } }
    const response = await fetch(`http://127.0.0.1:${ingress.port}/webhooks/gcp/${token}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(flat),
    })
    expect(await response.json()).toEqual({ accepted: true, duplicate: false, issueId: 202 })
    store.close()
  })

  it('关闭后释放监听端口', async () => {
    const store = database()
    const { ingress } = await startIngress(store)
    const port = ingress.port
    await ingress.close()
    ingresses.length = 0
    await expect(startIngress(store, port)).resolves.toMatchObject({ ingress: { port } })
    store.close()
  })
})
