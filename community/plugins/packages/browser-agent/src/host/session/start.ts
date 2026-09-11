/**
 * 启动一个 bsk 会话：解析目标浏览器实例，再把初始运行态交给调用方登记。
 *
 * 多实例时不猜测：直接拒绝并列出候选，让部署方用 `browserInstance` 固定其一，
 * 避免把命令发到用户自己正在用的浏览器上。
 */

import type { BskCommandRunner } from '../bsk.js'
import { NAVIGATION_TIMEOUT_MS } from '../bsk.js'
import type { BskSessionRecord } from '../config.js'
import { parseBrowsers } from '../parse.js'

/**
 * 计算 `session start` 的目标浏览器参数。
 * @param runner - bsk 命令执行器
 * @param browserInstance - 目标实例（id 或 label）；空串表示要求恰好一个实例
 * @returns 附加参数（配置指定时带 `--browser`，唯一实例时为空）
 */
export async function browserArgsFor(runner: BskCommandRunner, browserInstance: string): Promise<string[]> {
  if (browserInstance !== '') return ['--browser', browserInstance]
  const listed = await runner.run(['browsers', '--json'], { timeoutMs: NAVIGATION_TIMEOUT_MS })
  const browsers = parseBrowsers(listed.json, listed.rows)
  if (browsers.length === 0) {
    throw new Error('未检测到已连接的浏览器：请确认 browser-skill 扩展已加载并连接（可执行 bsk doctor 检查）')
  }
  if (browsers.length > 1) {
    const candidates = browsers
      .map(browser => `${browser.instanceId}（${browser.browserName}${browser.label === '' ? '' : ` / ${browser.label}`}）`)
      .join('、')
    throw new Error(`检测到 ${String(browsers.length)} 个浏览器实例，请在插件配置 browserInstance 中指定其一：${candidates}`)
  }
  return []
}

/**
 * 启动一个新的 bsk 会话。
 * @param runner - bsk 命令执行器
 * @param browserInstance - 目标实例（id 或 label）
 * @param key - 复合会话键（仅用于日志）
 * @returns 初始运行态记录
 */
export async function startBskSession(
  runner: BskCommandRunner,
  browserInstance: string,
  key: string,
): Promise<BskSessionRecord> {
  await runner.ensureDaemon()
  const outcome = await runner.run(['session', 'start', '--json', ...await browserArgsFor(runner, browserInstance)], {
    timeoutMs: NAVIGATION_TIMEOUT_MS,
  })
  const bskSessionId = String(outcome.json?.['session_id'] ?? '')
  if (bskSessionId === '') throw new Error('bsk 未返回会话 id（session start 输出异常）')
  const now = Date.now()
  return {
    bskSessionId,
    windowId: outcome.json?.['agent_window_id'] !== undefined ? String(outcome.json['agent_window_id']) : null,
    startedAtMs: now,
    lastActionAtMs: now,
    currentUrl: null,
    pageTitle: null,
    refsStale: true,
    tabCount: 1,
    lastScreenshotPath: null,
    lastError: null,
  }
}
