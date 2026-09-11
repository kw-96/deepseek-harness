/**
 * 快照文本处理：截断、引用计数与标题提取。所有模型可见的 aria 快照都
 * 经过这里，保证输出上限固定且可解释。
 */

/** 一次快照的规范化结果。 */
export interface SnapshotPayload {
  /** aria 树文本（含 `@eN` 引用）。 */
  text: string
  /** 树中的引用个数（`ref_count`）。 */
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
 * 从 aria 快照首行提取页面标题（`@e1 RootWebArea "标题"`）。
 * @param snapshotText - 快照文本
 * @returns 标题，取不到时为空串
 */
export function extractTitle(snapshotText: string): string {
  const match = /^\s*@e\d+\s+\S+\s+"([^"]*)"/.exec(snapshotText)
  return match?.[1] ?? ''
}

/**
 * 取快照中的第一个引用，作为「整页」级别的元素引用。
 * @param snapshotText - 快照文本
 * @returns 形如 `@e1` 的引用，取不到时为 null
 */
export function firstRef(snapshotText: string): string | null {
  return /@e\d+/.exec(snapshotText)?.[0] ?? null
}

/**
 * 统计快照中的引用个数。
 * @param snapshotText - 快照文本
 * @returns 引用个数
 */
export function countRefs(snapshotText: string): number {
  return new Set(snapshotText.match(/@e\d+/g) ?? []).size
}
