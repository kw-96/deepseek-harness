import { describe, expect, it } from 'vitest'
import { controlPanelNavigationScript, injectControlPanelNavigation } from '../../src/harness/navigation.js'
import { adminPage } from '../../src/plugins/admin/page.js'

describe('Ticket Hub 控制面', () => {
  it('提供易协作查询、填写核验、统计与模型配置入口', () => {
    const page = adminPage()
    for (const section of ['业务总览', '工单查询', '填写核验', '数据统计', 'Webhook 事件', '巡检预览', 'POPO 消息', '巡检发送', '设置']) {
      expect(page).toContain(section)
    }
    expect(page).toContain('<title>Ticket Hub</title>')
    expect(page).toContain('<span class="brand">Ticket Hub</span>')
    expect(page).not.toContain('工单控制面')
    for (const value of ['/api/admin/issues/sync', '/api/admin/issues/', '/api/admin/issue-reviews', '/api/admin/review-settings', '/api/admin/stats']) {
      expect(page).toContain(value)
    }
    expect(page).toContain("const base=location.pathname.replace(/[/]$/,'')")
    expect(page).toContain('fetch(base+path')
    expect(page).not.toContain('fetch(path,')
    expect(page).toContain('提单规范知识库')
    expect(page).toContain('模型服务商')
    expect(page).toContain('发送补全提醒')
    expect(page).toContain('入口回调记录')
    expect(page).toContain('id="webhookRequests"')
    expect(page).toContain('id="ingressInfo"')
    expect(page).toContain('data-page="vivo"')
    expect(page).toContain('id="vivoRows"')
    expect(page).toContain('id="vivoRuns"')
    expect(page).toContain('id="vivoSummary"')
    expect(page).toContain('/api/admin/vivo')
    expect(page).toContain('确认发送正式巡检结果')
    expect(page).toContain('data-desktop-bar')
    expect(page).toContain('.desktop-bar{position:fixed;top:0;left:0;right:0;height:36px;display:none')
    expect(page).toContain('body.has-desktop-bar .desktop-bar{display:flex}')
    expect(page).toContain('.page.active{display:flex;flex-direction:column;gap:14px}')
    expect(page).toContain('.pill{')
    expect(page).toContain('.truncate{')
    expect(page).toContain('td.num,th.num{text-align:right')
    expect(page).toContain('function fmtTime(')
    expect(page).toContain('function mkPill(')
    expect(page).toContain('window.__TAURI__')
    expect(page).not.toContain('管理令牌')
    expect(page).not.toContain('adminToken')
    expect(page).not.toContain('😀')
    const script = page.match(/<script>([\s\S]*)<\/script>/)?.[1]
    expect(script).toBeTruthy()
    expect(() => new Function(script ?? '')).not.toThrow()
  })

  it('通过官方索引扩展挂入侧边栏设置区域', () => {
    const script = controlPanelNavigationScript()
    expect(script).not.toContain('</script')
    expect(script).toContain("querySelector('[class*=settingsArea]')")
    expect(script).toContain("const path='/workorder-agent'")
    expect(script).toContain("link.textContent='Ticket Hub'")
    expect(script).not.toContain('工单控制面')
    const html = injectControlPanelNavigation('<html><body><main></main></body></html>')
    expect(html).toContain('data-workorder-navigation')
  })
})
