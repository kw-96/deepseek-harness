/** 差异文本按行分类，供着色渲染（与 Git 面板的行内差异视图共用）。 */

export type DiffLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'context'

export interface DiffLine { kind: DiffLineKind; text: string }

/** 认作元信息（文件头、索引行、模式变更等）的前缀。 */
const META_PREFIXES = [
  'diff ', 'index ', '---', '+++', 'new file', 'deleted file', 'old mode', 'new mode',
  'similarity', 'rename ', 'copy ', 'Binary files',
]

/**
 * 把 unified diff 拆成带类别的行。
 * @param text diff 原文
 * @returns 逐行类别与内容
 */
export function parseDiffLines(text: string): DiffLine[] {
  if (text.trim() === '') return []
  return text.split('\n').map(line => {
    if (line.startsWith('@@')) return { kind: 'hunk', text: line }
    if (line.startsWith('+') && !line.startsWith('+++')) return { kind: 'add', text: line }
    if (line.startsWith('-') && !line.startsWith('---')) return { kind: 'del', text: line }
    if (META_PREFIXES.some(prefix => line.startsWith(prefix))) return { kind: 'meta', text: line }
    return { kind: 'context', text: line }
  })
}
