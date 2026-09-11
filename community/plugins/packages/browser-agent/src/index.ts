/**
 * dsh-browser-agent Host 半：把 browser-skill 的 bsk CLI 包装成模型工具，
 * 并托管每个 DSH 会话的 bsk 会话。会话回收有四条路径——模型显式调用
 * browser_stop、DSH 会话结束（agent/disposed）、宿主会话不存在时的孤儿回收、
 * 插件卸载——另有空闲巡检兜底，因此不会留下无人关闭的 Agent Window。
 */

import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-tools'
import { SessionId } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createImageSaver } from './host/attachment.js'
import { BskRunner } from './host/bsk.js'
import { errorText } from './host/parse.js'
import type { BrowserAgentConfig } from './host/config.js'
import { BrowserAgentConfigSchema, resolveConfig } from './host/config.js'
import { activeTabUrl, parseBrowsers, parseTabs } from './host/parse.js'
import { BrowserPolicy } from './host/policy.js'
import { BskSessionStore } from './host/store.js'
import { runSweep } from './host/sweep.js'
import type { ApprovalFace } from './tools/shared.js'
import { registerControlTools } from './tools/control.js'
import { registerInteractTools } from './tools/interact.js'
import { registerNavigateTools } from './tools/navigate.js'
import { registerObserveTools } from './tools/observe.js'
import type { BrowserPanelSnapshot, BrowserPreviewResult, BrowserSessionView, BrowserStopResult } from './types.js'

export type * from './types.js'

/** 空闲巡检周期（毫秒）。 */
const SWEEP_INTERVAL_MS = 60_000
/** 内联预览的截图大小上限（字节）。 */
const PREVIEW_MAX_BYTES = 1_500_000

/** BrowserAgent Remote：右侧面板的状态读取、截图预览与会话结束。 */
export class BrowserAgent extends TypertRemoteService {
  // `isOwnerAlive` 经 `ctx.agents` 判定宿主会话是否还在，因此必须声明该注入；
  // 未声明的属性访问会抛 `cannot get property "agents" without inject`。
  static inject = ['agents', 'tools', 'subprocess']
  static Config = BrowserAgentConfigSchema

  private readonly config: BrowserAgentConfig
  private readonly runner: BskRunner
  private readonly store: BskSessionStore
  private readonly policy: BrowserPolicy

  /**
   * @param ctx - 宿主上下文
   * @param config - 部署配置；缺省或给出部分字段时与内置默认值合并
   */
  constructor(ctx: Context, config: Partial<BrowserAgentConfig> = {}) {
    super(ctx, 'browserAgent')
    // Loader 会按 `static Config` 校验并补默认值；直接构造（测试、手工挂载）
    // 时可能只给部分字段甚至 {}，这里统一兜底，避免出现 undefined 配置。
    const resolved = resolveConfig(config)
    this.config = resolved
    this.runner = new BskRunner(ctx.subprocess, resolved.binary, resolved.workspaceRoot, message => { ctx.logger.info(message) })
    this.policy = new BrowserPolicy({
      allowEvaluate: resolved.allowEvaluate,
      sensitivePatterns: resolved.sensitivePatterns,
      allowedPatterns: resolved.allowedPatterns,
    })
    this.store = new BskSessionStore(this.runner, {
      idleTimeoutMs: resolved.idleTimeoutMs,
      snapshotMaxChars: resolved.snapshotMaxChars,
      browserInstance: resolved.browserInstance,
      // 宿主里查不到该会话即视为孤儿：宿主重启后会话 id 会变，旧记录再没人能 stop。
      isOwnerAlive: sessionId => ctx.agents.get(SessionId(sessionId)) !== undefined,
      log: message => { ctx.logger.info(message) },
    })
    registerBrowserTools(ctx, {
      runner: this.runner,
      store: this.store,
      policy: this.policy,
      config: {
        actionTimeoutMs: resolved.actionTimeoutMs,
        navigationTimeoutMs: resolved.navigationTimeoutMs,
        screenshotDir: resolved.screenshotDir,
        requireApprovalForBorrow: resolved.requireApprovalForBorrow,
        clickMode: resolved.clickMode,
      },
      approval: ctx.get('approval') as ApprovalFace | undefined,
      saveImage: createImageSaver(ctx),
    })
    ctx.on('agent/disposed', ({ agent }) => {
      void this.store.stop(String(agent.session.id), 'DSH 会话结束')
    })
    const timer = ctx.get('timer')
    if (timer !== undefined) {
      ctx.effect(() => {
        const dispose = timer.interval(() => {
          void runSweep(this.store, Date.now(), message => { ctx.logger.warn(message) })
        }, SWEEP_INTERVAL_MS)
        return () => { dispose() }
      }, 'browser-agent session sweep')
    }
    ctx.effect(() => async () => { await this.store.stopAll('插件卸载') }, 'browser-agent sessions')
  }

  /**
   * 面板状态：daemon/浏览器、本会话的 bsk 会话与 Agent Window 标签页。
   * @param sessionId - DSH 会话 id
   * @returns 面板快照
   */
  @Remote('panel')
  async panel(sessionId: string): Promise<BrowserPanelSnapshot> {
    const record = this.store.get(sessionId)
    const status = await this.runner.run(['status', '--json'], { allowFailure: true })
    let tabs: BrowserPanelSnapshot['tabs'] = []
    let screenshotPath = record?.lastScreenshotPath ?? null
    if (record !== undefined) {
      const listed = await this.runner.run(
        ['tab', 'list', '--json', '--scope', 'agent', '--session', record.bskSessionId],
        { allowFailure: true },
      )
      tabs = parseTabs(listed.json)
      const url = activeTabUrl(listed.json)
      this.store.update(sessionId, { tabCount: tabs.length, ...(url !== undefined ? { currentUrl: url } : {}) })
      screenshotPath = this.store.get(sessionId)?.lastScreenshotPath ?? screenshotPath
    }
    return {
      session: this.sessionView(sessionId),
      browsers: parseBrowsers(status.json),
      tabs,
      lastScreenshotPath: screenshotPath,
    }
  }

  /**
   * 结束该 DSH 会话的浏览器会话（面板按钮）。
   * @param sessionId - DSH 会话 id
   * @returns 结束结果
   */
  @Remote('stop')
  async stop(sessionId: string): Promise<BrowserStopResult> {
    const stopped = await this.store.stop(sessionId, '面板手动结束')
    return { stopped, message: stopped ? '已结束浏览器会话' : '当前没有进行中的浏览器会话' }
  }

  /**
   * 读取最近一次截图供面板预览（有大小上限）。
   * @param sessionId - DSH 会话 id
   * @returns 内联预览，或不可预览的原因
   */
  @Remote('preview')
  async preview(sessionId: string): Promise<BrowserPreviewResult> {
    const path = this.store.get(sessionId)?.lastScreenshotPath ?? null
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

  private sessionView(sessionId: string): BrowserSessionView {
    const record = this.store.get(sessionId)
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
      idleDeadlineAtMs: record.lastActionAtMs + this.config.idleTimeoutMs,
      lastError: record.lastError,
    }
  }
}

/**
 * 注册本插件的全部模型工具。
 * @param ctx - 宿主上下文（提供 tools 注册表）
 * @param deps - 工具依赖
 */
function registerBrowserTools(ctx: Context, deps: Parameters<typeof registerObserveTools>[1]): void {
  registerObserveTools(ctx, deps)
  registerInteractTools(ctx, deps)
  registerNavigateTools(ctx, deps)
  registerControlTools(ctx, deps)
}

export default BrowserAgent
