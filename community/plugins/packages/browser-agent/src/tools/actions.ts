/**
 * 工具层动作封装：命令执行、快照补拍、引用刷新与 DOM 点击表达式。
 * 所有工具的动作都经过这里，保证「引用新鲜」「会话失效即重置」与超时口径一致。
 */

import type { BskOutcome } from '../host/bsk.js'
import { BskError, NAVIGATION_TIMEOUT_MS } from '../host/bsk.js'
import { errorText, isStaleSessionError } from '../host/parse.js'
import type { SnapshotPayload } from '../host/snapshot.js'
import type { BskSessionRecord } from '../host/config.js'
import type { BrowserToolDeps } from './shared.js'

/** 扩展注入的浮层自定义元素名（`clickMode: 'dom'` 需要绕过它）。 */
export const OVERLAY_TAG = 'browser-skill-overlay'

/**
 * 执行一条带会话上下文的 bsk 命令。
 * @param deps - 工具依赖
 * @param sessionId - DSH 会话 id
 * @param args - bsk 参数（不含 `--session`）
 * @param options - 超时与取消
 * @returns 命令结果
 */
export async function runFor(
  deps: BrowserToolDeps,
  sessionId: string,
  args: readonly string[],
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<BskOutcome> {
  const record = await deps.store.ensure(sessionId)
  try {
    const outcome = await deps.runner.run([...args, '--session', record.bskSessionId], {
      timeoutMs: options.timeoutMs ?? deps.config.actionTimeoutMs,
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    })
    deps.store.update(sessionId, { lastError: null })
    return outcome
  } catch (error) {
    if (isStaleSessionError(error)) {
      const lastUrl = deps.store.get(sessionId)?.currentUrl ?? null
      deps.store.drop(sessionId, '会话已失效')
      // daemon 重启会清空会话注册表。这里不只是丢弃记录：顺手重建会话并回到
      // 失效前那一页，模型只需重新观测即可继续，而不必重跑整段流程。
      const restored = await restoreSession(deps, sessionId, lastUrl)
      throw new BskError(
        restored
          ? `浏览器会话已失效（daemon 重启或被外部结束），已自动重建会话并回到 ${lastUrl ?? '空白页'}；之前的 @eN 引用全部失效，请重新观测后继续`
          : '浏览器会话已失效（可能被外部结束或 daemon 重启），已重置；请重新用 browser_open 打开页面',
        {
          code: 'stale_session',
          hint: restored ? '页面已恢复，重新观测即可继续' : '下一次调用会自动新建会话，页面状态需要重新打开',
          exitCode: error.exitCode,
        },
      )
    }
    deps.store.update(sessionId, { lastError: errorText(error) })
    throw error
  }
}

/**
 * 会话失效后自动重建，并尽力恢复到失效前的页面。
 * @param deps - 工具依赖
 * @param sessionId - 会话键
 * @param lastUrl - 失效前记录的页面地址
 * @returns 是否成功重建（失败时不抛出，由调用方决定如何报错）
 */
async function restoreSession(
  deps: BrowserToolDeps,
  sessionId: string,
  lastUrl: string | null,
): Promise<boolean> {
  try {
    const record = await deps.store.ensure(sessionId)
    if (lastUrl === null || lastUrl === '' || lastUrl === 'about:blank') return true
    await deps.runner.run(['navigate', lastUrl, '--session', record.bskSessionId, '--json'], {
      timeoutMs: deps.config.navigationTimeoutMs,
    })
    deps.store.update(sessionId, { currentUrl: lastUrl, refsStale: true })
    return true
  } catch (failure) {
    deps.store.drop(sessionId, `重建失败：${errorText(failure)}`)
    return false
  }
}

/** 一次快照的结果：会话运行态与规范化快照。 */
export interface SnapshotOutcome {
  record: BskSessionRecord
  snapshot: SnapshotPayload
}

/**
 * 拍一次观测快照并写入会话状态。
 * @param deps - 工具依赖
 * @param sessionId - DSH 会话 id
 * @param signal - 取消信号
 * @returns 会话运行态与快照
 */
export async function takeSnapshot(
  deps: BrowserToolDeps,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SnapshotOutcome> {
  const outcome = await runFor(deps, sessionId, ['snapshot', '--json'], {
    ...(signal !== undefined ? { signal } : {}),
  })
  const json = outcome.json ?? {}
  const snapshot = deps.store.recordSnapshot(sessionId, {
    text: typeof json['text'] === 'string' ? json['text'] : outcome.stdout,
    refCount: typeof json['ref_count'] === 'number' ? json['ref_count'] : 0,
    truncated: json['truncated'] === true,
  })
  const record = deps.store.get(sessionId)
  if (record === undefined) throw new Error('会话在快照期间被回收，请重试')
  return { record, snapshot }
}

/**
 * 写操作前保证引用新鲜：引用已失效时补拍一次快照。
 * @param deps - 工具依赖
 * @param sessionId - DSH 会话 id
 * @param signal - 取消信号
 * @returns 补拍的快照；引用本就新鲜时为 null
 */
export async function refreshRefs(
  deps: BrowserToolDeps,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SnapshotPayload | null> {
  const record = await deps.store.ensure(sessionId)
  if (!record.refsStale) return null
  const captured = await takeSnapshot(deps, sessionId, signal)
  return captured.snapshot
}

/**
 * 记录导航结果（URL）并把引用标记为失效。
 * @param deps - 工具依赖
 * @param sessionId - DSH 会话 id
 * @param outcome - 导航类命令结果
 */
export function recordNavigation(deps: BrowserToolDeps, sessionId: string, outcome: BskOutcome): void {
  const json = outcome.json ?? {}
  const finalUrl = json['final_url'] ?? json['url']
  deps.store.markRefsStale(sessionId)
  deps.store.update(sessionId, {
    currentUrl: typeof finalUrl === 'string' ? finalUrl : deps.store.get(sessionId)?.currentUrl ?? null,
  })
}

/** 导航类工具的超时取值。 */
export function navigationTimeout(deps: BrowserToolDeps): number {
  return Math.max(deps.config.navigationTimeoutMs, NAVIGATION_TIMEOUT_MS)
}

/**
 * 把毫秒转成 bsk 接受的时长写法（`30s` / `1500ms`）。
 * @param ms - 毫秒
 * @returns bsk 时长参数
 */
export function durationArg(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  return `${String(seconds)}s`
}

/**
 * 生成「在 (x, y) 处点击最上层非浮层元素」的 JavaScript 表达式。
 *
 * 0.2.x 的扩展会注入固定定位、`pointer-events: auto` 的 `<browser-skill-overlay>`，
 * 处于 blocking（人工接管）状态时它先接到指针事件，`bsk click` 的点击到不了页面；
 * `clickMode: 'dom'` 改为在目标坐标上直接触发元素 `click()` 并跳过该浮层。
 *
 * 表达式由插件生成、内容固定（只嵌入两个坐标数字、且不含引号），模型无法借它注入脚本。
 * @param x - 视口内 X 坐标（CSS 像素）
 * @param y - 视口内 Y 坐标（CSS 像素）
 * @returns 可直接交给 `bsk evaluate` 的表达式
 */
export function domClickExpression(x: number, y: number): string {
  return [
    '(()=>{',
    `const xs=${String(x)},ys=${String(y)};`,
    'const all=document.elementsFromPoint(xs,ys);',
    `const tag=String.fromCharCode(${[...OVERLAY_TAG].map(c => c.charCodeAt(0)).join(',')});`,
    'const hit=all.find(e=>e.tagName.toLowerCase()!==tag&&!e.closest(tag));',
    'const target=hit??all[all.length-1];',
    'if(!target)return String.fromCharCode(110,111,110,101);',
    'target.click();',
    'return target.tagName;',
    '})()',
  ].join('')
}
