/**
 * 观测结果的统一形状与截图能力。
 *
 * 截图能力随 bsk 版本变化：0.1.x 的扩展在本机 Edge 上整页截图会失败
 * （`cdp_failed: image readback failed`）而元素截图可用，此时回退到「根节点引用」
 * 得到视口等效截图；0.2.1 起整页截图已可用，回退只剩兜底意义。
 */

import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { BskError } from '../host/bsk.js'
import { activeTabUrl, sniffImageMediaType } from '../host/parse.js'
import { extractRootRef } from '../host/snapshot.js'
import type { SnapshotPayload } from '../host/snapshot.js'
import type { BskSessionRecord } from '../host/config.js'
import type { ImageRefLike } from '../host/attachment.js'
import type { BrowserToolDeps } from './shared.js'
import { runFor, takeSnapshot } from './actions.js'
import { textBlock, valueSchema } from './shared.js'

export async function refreshCurrentUrl(
  deps: BrowserToolDeps,
  sessionId: string,
  signal?: AbortSignal,
): Promise<void> {
  const listed = await runFor(deps, sessionId, ['tab', 'list', '--json', '--scope', 'agent'], {
    ...(signal !== undefined ? { signal } : {}),
  })
  const url = activeTabUrl(listed.json)
  if (url !== undefined) deps.store.update(sessionId, { currentUrl: url })
}

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
  /** 已提交到宿主附件库的图像引用；宿主不支持内联时为 undefined。 */
  image?: ImageRefLike | undefined
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
 * 把截图字节提交到宿主附件库，成功时给结果补上可内联的图像引用。
 *
 * 附件是增强项：宿主没挂附件库、类型不认识或提交失败都只是退回「只给路径」，
 * 绝不让工具调用因为附件环节失败。
 * @param deps - 工具依赖
 * @param raw - 已解析的截图结果
 * @returns 可能带上 image 的结果
 */
async function withAttachment(deps: BrowserToolDeps, sessionId: string, raw: ScreenshotResult): Promise<ScreenshotResult> {
  const save = deps.saveImage
  if (save === undefined || raw.path === '') return raw
  try {
    const data = await readFile(raw.path)
    const mediaType = sniffImageMediaType(data)
    if (mediaType === undefined) return raw
    const image = await save({ sessionId, data, mediaType, name: basename(raw.path) })
    return image === undefined ? raw : { ...raw, image }
  } catch {
    // 附件提交失败不影响截图本身：保留路径形态。
    return raw
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
    return await withAttachment(deps, sessionId, toScreenshotResult(direct.json, ''))
  }
  try {
    const full = await runFor(deps, sessionId, build(undefined), { signal })
    return await withAttachment(deps, sessionId, toScreenshotResult(full.json, ''))
  } catch (error) {
    if (!(error instanceof BskError) || error.code !== 'cdp_failed') throw error
    // 0.2.1 起整页截图已可用，cdp_failed 多为瞬时故障，先重试一次。
    const retry = await runFor(deps, sessionId, build(undefined), { signal }).catch(() => undefined)
    if (retry !== undefined) return await withAttachment(deps, sessionId, toScreenshotResult(retry.json, '整页截图首次失败，重试成功'))
    // 旧版（扩展 0.1.x）整页截图会失败而元素级截图可用；那时的 aria 快照把引用标在
    // 根节点上，回退到它等价于视口截图。0.2.x 的 VOM 不给根节点引用，此处取不到即如实报错。
    const captured = await takeSnapshot(deps, sessionId, signal)
    const root = extractRootRef(captured.snapshot.text)
    if (root === null) throw error
    const fallback = await runFor(deps, sessionId, build(root), { signal })
    return await withAttachment(deps, sessionId, toScreenshotResult(
      fallback.json,
      `整页截图不被当前浏览器支持（${error.message}），已回退为根节点 ${root} 截图`,
    ))
  }
}
