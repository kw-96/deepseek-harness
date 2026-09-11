// @vitest-environment jsdom
/** 右栏面板的渲染与交互回归：状态徽标、标签页列表、截图预览与结束会话。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BrowserPanelApi } from '../src/client/faces.js'
import { BrowserBody } from '../src/client/BrowserBody.js'
import { zh } from '../src/client/locales.js'
import type {
  BrowserInterruptResult, BrowserLiveView, BrowserPanelSnapshot, BrowserPreviewResult, BrowserStopResult,
} from '../src/types.js'

/** 空闲的实时视图。 */
const IDLE_LIVE: BrowserLiveView = {
  sessionOpen: true,
  running: false,
  toolName: '',
  summary: '',
  startedAtMs: 0,
  elapsedMs: 0,
  currentUrl: 'https://example.com/',
  pageTitle: '示例页',
  lastActionAtMs: 0,
  idleDeadlineAtMs: 0,
}

afterEach(() => { cleanup() })

/** 用中文词典实现 t（与宿主 locale 服务的语义一致）。 */
const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

/** 构造面板快照。 */
function snapshot(overrides: Partial<BrowserPanelSnapshot> = {}): BrowserPanelSnapshot {
  return {
    session: {
      sessionId: 'sess-1',
      bskSessionId: 'abcd',
      state: 'open',
      currentUrl: 'https://example.com/',
      pageTitle: '示例页',
      tabCount: 1,
      lastActionAtMs: 0,
      idleDeadlineAtMs: 0,
      lastError: null,
    },
    browsers: [{
      instanceId: 'i1', browserName: 'edge', label: '本机', extensionVersion: '0.1.2', versionSkew: false,
    }],
    tabs: [{ tabId: '7', url: 'https://example.com/', title: '标签页标题', scope: 'agent' }],
    lastScreenshotPath: null,
    ...overrides,
  }
}

/** 构造面板 API 替身。 */
function api(
  panel: BrowserPanelSnapshot,
  preview: BrowserPreviewResult = { dataUrl: null, path: null, bytes: 0, message: '本次会话尚未截图' },
  live: BrowserLiveView = IDLE_LIVE,
): { api: BrowserPanelApi, calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    api: {
      panel: async () => { calls.push('panel'); return panel },
      stop: async (): Promise<BrowserStopResult> => { calls.push('stop'); return { stopped: true, message: '已结束浏览器会话' } },
      preview: async () => { calls.push('preview'); return preview },
      live: async (): Promise<BrowserLiveView> => {
        calls.push('live')
        return live
      },
      interrupt: async (): Promise<BrowserInterruptResult> => {
        calls.push('interrupt')
        return { interrupted: true, message: '已中断当前动作' }
      },
    },
  }
}

describe('浏览器面板', () => {
  it('会话未开启时显示空闲状态与空列表', async () => {
    const idle = snapshot({
      session: { ...snapshot().session, state: 'idle', bskSessionId: null, currentUrl: null, pageTitle: null },
      browsers: [],
      tabs: [],
    })
    render(<BrowserBody sessionId="sess-1" api={api(idle).api} t={t} />)
    expect(await screen.findByText(zh.idle)).toBeDefined()
    expect(screen.getByText(zh.noBrowser)).toBeDefined()
    expect(screen.getByText(zh.noTabs)).toBeDefined()
    expect(screen.getByText(zh.noScreenshot)).toBeDefined()
    expect((screen.getByText(zh.stop) as HTMLButtonElement).disabled).toBe(true)
  })

  it('运行中显示会话 id、当前页面与标签页', async () => {
    render(<BrowserBody sessionId="sess-1" api={api(snapshot()).api} t={t} />)
    expect(await screen.findByText(zh.open)).toBeDefined()
    expect(screen.getByText(/abcd/)).toBeDefined()
    expect(screen.getByText('示例页')).toBeDefined()
    expect(screen.getByText('标签页标题')).toBeDefined()
    expect(screen.getByText('https://example.com/')).toBeDefined()
    expect(screen.getByText('7 · https://example.com/')).toBeDefined()
    expect(screen.getByText(/0\.1\.2/)).toBeDefined()
  })

  it('结束会话会调用 stop 并刷新状态', async () => {
    const { api: panelApi, calls } = api(snapshot())
    render(<BrowserBody sessionId="sess-1" api={panelApi} t={t} />)
    fireEvent.click(await screen.findByText(zh.stop))
    await waitFor(() => { expect(calls).toContain('stop') })
    expect(await screen.findByText('已结束浏览器会话')).toBeDefined()
    await waitFor(() => { expect(calls.filter(call => call === 'panel').length).toBeGreaterThan(1) })
  })

  it('截图按钮加载预览并渲染图像', async () => {
    const withShot = snapshot({ lastScreenshotPath: 'C:/tmp/shot.png' })
    const { api: panelApi } = api(withShot, {
      dataUrl: 'data:image/png;base64,AAAA', path: 'C:/tmp/shot.png', bytes: 4, message: null,
    })
    render(<BrowserBody sessionId="sess-1" api={panelApi} t={t} />)
    fireEvent.click(await screen.findByText(zh.showPreview))
    const image = await screen.findByAltText(zh.screenshot) as HTMLImageElement
    expect(image.src).toContain('data:image/png;base64,AAAA')
  })

  it('预览不可用时给出原因而不是空白', async () => {
    const withShot = snapshot({ lastScreenshotPath: 'C:/tmp/big.png' })
    const { api: panelApi } = api(withShot, {
      dataUrl: null, path: 'C:/tmp/big.png', bytes: 9_000_000, message: '截图过大，未内联预览',
    })
    render(<BrowserBody sessionId="sess-1" api={panelApi} t={t} />)
    fireEvent.click(await screen.findByText(zh.showPreview))
    expect(await screen.findByText(zh.previewFailed)).toBeDefined()
  })
})
describe('实时观测区', () => {
  it('执行中显示动作与耗时，中断按钮可用', async () => {
    const running: BrowserLiveView = {
      ...IDLE_LIVE,
      running: true,
      toolName: 'browser_click',
      summary: 'browser_click @e2',
      startedAtMs: Date.now() - 2500,
      elapsedMs: 2500,
    }
    const { api: panelApi, calls } = api(snapshot(), { dataUrl: null, path: null, bytes: 0, message: null }, running)
    render(<BrowserBody sessionId="sess-1" api={panelApi} t={t} />)
    expect(await screen.findByText(/browser_click @e2/)).toBeDefined()
    expect(screen.getByText(/已用时/)).toBeDefined()
    const button = screen.getByText(zh.interrupt) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    await waitFor(() => { expect(calls).toContain('interrupt') })
  })

  it('空闲时中断按钮禁用并显示空闲', async () => {
    render(<BrowserBody sessionId="sess-1" api={api(snapshot()).api} t={t} />)
    expect(await screen.findByText(zh.noAction)).toBeDefined()
    expect((screen.getByText(zh.interrupt) as HTMLButtonElement).disabled).toBe(true)
  })
})