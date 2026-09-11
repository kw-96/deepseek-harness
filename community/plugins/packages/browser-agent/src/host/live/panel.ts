/**
 * 面板数据的组装：一次性快照（panel）、截图预览（preview）与实时动作视图（live）。
 *
 * 这些逻辑从插件类里搬出来，宿主半只保留 Remote 方法签名；面板的轮询频率很高，
 * 所以 live 视图刻意不截图——截图由客户端按更慢的节奏单独调 preview。
 */

import { readFile } from 'node:fs/promises'
import type { BskCommandRunner } from '../bsk.js'
import { errorText } from '../parse.js'
import { activeTabUrl, parseBrowsers, parseTabs } from '../parse.js'
import type { BskSessionStore } from '../store.js'
import type { BrowserLiveView, BrowserPanelSnapshot, BrowserPreviewResult, BrowserSessionView } from '../../types.js'
import type { ActionTracker } from './tracker.js'

/** 面板预览内联上限：超过就只给路径。 */
export const PREVIEW_MAX_BYTES = 4 * 1024 * 1024

/** 面板数据组装所需的依赖。 */
export interface PanelDeps {
  runner: BskCommandRunner
  store: BskSessionStore
  tracker: ActionTracker
  idleTimeoutMs: number
}

/**
 * 单个 DSH 会话的视图。
 * @param store - 会话托管器
 * @param idleTimeoutMs - 空闲上限（用于算出回收时刻）
 * @param sessionId - DSH 会话 id
 * @returns 会话视图
 */
export function sessionView(store: BskSessionStore, idleTimeoutMs: number, sessionId: string): BrowserSessionView {
  const record = store.get(sessionId)
  if (record === undefined) {
    return {
      sessionId,
      bskSessionId: null,
      state: 'idle',
      currentUrl: null,
      pageTitle: null,
      tabCount: 0,
      lastActionAtMs: 0,
      idleDeadlineAtMs: null,
      lastError: null,
    }
  }
  return {
    sessionId,
    bskSessionId: record.bskSessionId,
    state: 'open',
    currentUrl: record.currentUrl,
    pageTitle: record.pageTitle,
    tabCount: record.tabCount,
    lastActionAtMs: record.lastActionAtMs,
    idleDeadlineAtMs: record.lastActionAtMs + idleTimeoutMs,
    lastError: record.lastError,
  }
}

/**
 * 面板一次性快照：daemon/浏览器、本会话的 bsk 会话与 Agent Window 标签页。
 * @param deps - 面板依赖
 * @param sessionId - DSH 会话 id
 * @returns 面板快照
 */
export async function panelSnapshot(deps: PanelDeps, sessionId: string): Promise<BrowserPanelSnapshot> {
  const record = deps.store.get(sessionId)
  const status = await deps.runner.run(['status', '--json'], { allowFailure: true })
  let tabs: BrowserPanelSnapshot['tabs'] = []
  let screenshotPath = record?.lastScreenshotPath ?? null
  if (record !== undefined) {
    const listed = await deps.runner.run(
      ['tab', 'list', '--json', '--scope', 'agent', '--session', record.bskSessionId],
      { allowFailure: true },
    )
    tabs = parseTabs(listed.json)
    const url = activeTabUrl(listed.json)
    deps.store.update(sessionId, { tabCount: tabs.length, ...(url !== undefined ? { currentUrl: url } : {}) })
    screenshotPath = deps.store.get(sessionId)?.lastScreenshotPath ?? screenshotPath
  }
  return {
    session: sessionView(deps.store, deps.idleTimeoutMs, sessionId),
    browsers: parseBrowsers(status.json),
    tabs,
    lastScreenshotPath: screenshotPath,
  }
}

/**
 * 读取最近一次截图供面板预览。
 * @param store - 会话托管器
 * @param sessionId - DSH 会话 id
 * @returns 内联预览，或不可预览的原因
 */
export async function previewShot(store: BskSessionStore, sessionId: string): Promise<BrowserPreviewResult> {
  const path = store.get(sessionId)?.lastScreenshotPath ?? null
  if (path === null) return { dataUrl: null, path: null, bytes: 0, message: '本次会话尚未截图' }
  try {
    const bytes = await readFile(path)
    if (bytes.byteLength > PREVIEW_MAX_BYTES) {
      return { dataUrl: null, path, bytes: bytes.byteLength, message: '截图过大，未内联预览' }
    }
    return {
      dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
      path,
      bytes: bytes.byteLength,
      message: null,
    }
  } catch (error) {
    return { dataUrl: null, path, bytes: 0, message: `读取截图失败：${errorText(error)}` }
  }
}

/**
 * 实时动作视图：当前动作、耗时与会话状态；不截图。
 * @param deps - 面板依赖
 * @param activeKey - 当前活跃会话的复合键
 * @param nowMs - 当前时间
 * @returns 实时视图
 */
export function liveView(deps: PanelDeps, activeKey: string, nowMs: number): BrowserLiveView {
  const record = deps.store.get(activeKey)
  const action = deps.tracker.current(activeKey)
  return {
    sessionOpen: record !== undefined,
    running: action !== undefined,
    toolName: action?.toolName ?? '',
    summary: action?.summary ?? '',
    startedAtMs: action?.startedAtMs ?? 0,
    elapsedMs: action === undefined ? 0 : Math.max(0, nowMs - action.startedAtMs),
    currentUrl: record?.currentUrl ?? '',
    pageTitle: record?.pageTitle ?? '',
    lastActionAtMs: record?.lastActionAtMs ?? 0,
    idleDeadlineAtMs: record === undefined ? null : record.lastActionAtMs + deps.idleTimeoutMs,
  }
}
