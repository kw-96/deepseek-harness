/**
 * 观测结果的统一形状与截图能力。整页截图在本机 Edge 上会被 CDP 拒绝
 * （image readback failed），元素级截图可用；因此整页失败时自动回退到
 * 「最新快照的根节点引用」，得到视口等效的可用截图。
 */

import { join } from 'node:path'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { BskError } from '../host/bsk.js'
import { firstRef } from '../host/snapshot.js'
import type { BskSessionRecord } from '../host/store.js'
import type { SnapshotPayload } from '../host/snapshot.js'
import type { BrowserToolDeps } from './shared.js'
import { runFor, takeSnapshot, textBlock, valueSchema } from './shared.js'

/** 模型可见的观测结果。 */
export interface ObservationValue {
  url: string
  title: string
  bskSessionId: string
  refs: number
  truncated: boolean
  note: string
  snapshot: string
}

/** 观测结果的输出 schema。 */
export const observationSchema = valueSchema({
  type: 'object',
  additionalProperties: false,
  properties: {
    url: { type: 'string', required: true },
    title: { type: 'string', required: true },
    bskSessionId: { type: 'string', required: true },
    refs: { type: 'integer', required: true },
    truncated: { type: 'boolean', required: true },
    note: { type: 'string', required: true },
    snapshot: { type: 'string', required: true },
  },
})

/**
 * 由会话运行态与快照组装观测结果。
 * @param record - 会话运行态
 * @param snapshot - 规范化快照
 * @param note - 附加说明（如「点击后已重新快照」）
 * @returns 观测值
 */
export function observationValue(
  record: BskSessionRecord,
  snapshot: SnapshotPayload,
  note = '',
): ObservationValue {
  return {
    url: record.currentUrl ?? '',
    title: record.pageTitle ?? '',
    bskSessionId: record.bskSessionId,
    refs: snapshot.refCount,
    truncated: snapshot.truncated,
    note,
    snapshot: snapshot.text,
  }
}

/** 观测结果的模型输出。 */
export const observationRender = (value: unknown): ContentBlock[] => {
  const seen = value as ObservationValue
  const head = [
    `url: ${seen.url === '' ? '(未知)' : seen.url}`,
    `title: ${seen.title === '' ? '(无标题)' : seen.title}`,
    `refs: ${String(seen.refs)}${seen.truncated ? '（快照已截断）' : ''}`,
    ...(seen.note === '' ? [] : [`note: ${seen.note}`]),
  ].join('\n')
  return textBlock(`${head}\n\n${seen.snapshot}`)
}

/** 简单回执的模型输出。 */
export const ackRender = (value: unknown): ContentBlock[] => textBlock(String((value as { message: string }).message))

/** 一次截图的产物。 */
export interface ScreenshotResult {
  path: string
  bytes: number
  width: number
  height: number
  /** 回退说明，例如「整页截图不被支持，已改用根节点截图」。 */
  note: string
}

/**
 * 解析一次截图命令的结果。
 * @param json - bsk 返回的 JSON
 * @param note - 回退说明
 * @returns 截图产物
 */
function toScreenshotResult(json: Record<string, unknown> | undefined, note: string): ScreenshotResult {
  const fields = json ?? {}
  return {
    path: String(fields['path'] ?? ''),
    bytes: typeof fields['byte_size'] === 'number' ? fields['byte_size'] : 0,
    width: typeof fields['width'] === 'number' ? fields['width'] : 0,
    height: typeof fields['height'] === 'number' ? fields['height'] : 0,
    note,
  }
}

/**
 * 截取当前标签页；`ref` 为空时先尝试整页，失败后回退到根节点引用。
 * @param deps - 工具依赖
 * @param sessionId - DSH 会话 id
 * @param ref - 可选的快照引用（`@eN`）
 * @param signal - 取消信号
 * @returns 截图产物
 */
export async function captureScreenshot(
  deps: BrowserToolDeps,
  sessionId: string,
  ref: string | undefined,
  signal: AbortSignal,
): Promise<ScreenshotResult> {
  const outPath = deps.config.screenshotDir === ''
    ? undefined
    : join(deps.config.screenshotDir, `bsk-shot-${String(Date.now())}.png`)
  const build = (targetRef: string | undefined): readonly string[] => [
    'screenshot', '--json',
    ...(targetRef !== undefined ? ['--ref', targetRef] : []),
    ...(outPath !== undefined ? ['--out', outPath] : []),
  ]
  if (ref !== undefined) {
    const direct = await runFor(deps, sessionId, build(ref), { signal })
    return toScreenshotResult(direct.json, '')
  }
  try {
    const full = await runFor(deps, sessionId, build(undefined), { signal })
    return toScreenshotResult(full.json, '')
  } catch (error) {
    if (!(error instanceof BskError) || error.code !== 'cdp_failed') throw error
    const captured = await takeSnapshot(deps, sessionId, signal)
    const root = firstRef(captured.snapshot.text)
    if (root === null) throw error
    const fallback = await runFor(deps, sessionId, build(root), { signal })
    return toScreenshotResult(fallback.json, `整页截图不被当前浏览器支持（${error.message}），已回退为根节点 ${root} 截图`)
  }
}
