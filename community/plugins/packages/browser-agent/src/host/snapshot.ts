/**
 * 快照文本处理：截断、引用计数与标题提取。
 *
 * bsk 的观测文本有两代格式，两者都要认：
 * - 0.1.x：aria 树，每个节点带引用，形如 `@e1 RootWebArea "标题"`；
 * - 0.2.x：VOM 语义观测，头部是 `@vom/@view/@layers/L1 page`，且引用只标在
 *   交互元素上，`RootWebArea "标题"` 行不再带 `@eN` 前缀。
 */

/** 一次快照的规范化结果。 */
export interface SnapshotPayload {
  /** 观测文本（含 `@eN` 引用）。 */
  text: string
  /** 文本中的引用个数（`ref_count`）。 */
  refCount: number
  /** 是否因上限被截断。 */
  truncated: boolean
}

/**
 * 按字符上限截断文本，并标记是否发生截断。
 * @param text - 原始文本
 * @param maxChars - 上限（字符数）
 * @returns 截断后的文本与标记
 */
export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: `${text.slice(0, maxChars)}\n…（已按上限截断，完整内容请用 --ref 收窄范围）`, truncated: true }
}

/**
 * 从观测文本提取页面标题。
 *
 * 先按 `RootWebArea "标题"` 匹配（新旧格式都适用），再退回旧版首行写法
 * `@eN RootWebArea "标题"`。
 * @param snapshotText - 观测文本
 * @returns 标题，取不到时为空串
 */
export function extractTitle(snapshotText: string): string {
  const rootArea = /RootWebArea[^\S\n]*"([^"]*)"/.exec(snapshotText)
  if (rootArea?.[1] !== undefined) return rootArea[1]
  const legacy = /^\s*@e\d+\s+\S+\s+"([^"]*)"/.exec(snapshotText)
  return legacy?.[1] ?? ''
}

/**
 * 取根节点（RootWebArea）那一行上的引用。
 *
 * 只有 0.1.x 的 aria 快照把引用标到根节点；0.2.x 的 VOM 只标交互元素，
 * 因此这里取不到是正常情况（调用方据此决定能否做「视口等价」截图回退）。
 * @param snapshotText - 观测文本
 * @returns 形如 `@e1` 的引用，取不到时为 null
 */
export function extractRootRef(snapshotText: string): string | null {
  const line = snapshotText.split('\n').find(text => text.includes('RootWebArea'))
  if (line === undefined) return null
  return /@e\d+/.exec(line)?.[0] ?? null
}

/**
 * 取观测文本中的第一个引用（0.2.x 下通常是页面上第一个交互元素）。
 * @param snapshotText - 观测文本
 * @returns 形如 `@e1` 的引用，取不到时为 null
 */
export function firstRef(snapshotText: string): string | null {
  return /@e\d+/.exec(snapshotText)?.[0] ?? null
}

/**
 * 统计观测文本中的引用个数。
 * @param snapshotText - 观测文本
 * @returns 引用个数
 */
export function countRefs(snapshotText: string): number {
  return new Set(snapshotText.match(/@e\d+/g) ?? []).size
}
