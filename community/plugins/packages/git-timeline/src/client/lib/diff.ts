/** 行内差异的纯展示解析：把 `git diff` 文本切成带类别的行。 */

/** 差异行的展示类别。 */
export type DiffLineKind = 'meta' | 'hunk' | 'context' | 'del' | 'add'

/** 一行差异：类别与原文（保留 `+`/`-`/空格前缀）。 */
export interface DiffLine {
  kind: DiffLineKind
  text: string
}

/**
 * 头部与元信息行前缀；`--- ` / `+++ ` 必须早于 `+` / `-` 判断，
 * 否则文件头会被当成增删行着色。
 */
const META_PREFIXES: readonly string[] = [
  'diff ', 'index ', '--- ', '+++ ', 'new file', 'deleted file', 'similarity index', 'dissimilarity index',
  'rename from', 'rename to', 'copy from', 'copy to', 'old mode', 'new mode', '\\ No newline',
]

/** 单行分类。 */
function classify(line: string): DiffLineKind {
  if (line.startsWith('@@')) return 'hunk'
  if (META_PREFIXES.some(prefix => line.startsWith(prefix))) return 'meta'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'context'
}

/**
 * 把差异文本切成带类别的行。
 * @param text diff 原文
 * @returns 每行的类别与原文；空输入返回空数组
 */
export function parseDiffLines(text: string): DiffLine[] {
  if (text === '') return []
  const lines = text.split('\n')
  // `git diff` 的输出以换行结尾，拆出的最后一个空元素不是内容行。
  if (lines.at(-1) === '') lines.pop()
  return lines.map(line => ({ kind: classify(line), text: line }))
}
