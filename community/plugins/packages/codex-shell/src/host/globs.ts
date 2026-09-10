/** 逗号分隔的简易 glob：支持 `*`、`?`、`**`，路径统一为正斜杠。 */

/** 把路径统一成 `/` 分隔，便于与 VS Code 式 glob 对齐。 */
export function normalizePosix(path: string): string {
  return path.replaceAll('\\', '/')
}

/** 拆分包含/排除输入为独立 glob 片段。 */
export function splitGlobs(raw: string | undefined): readonly string[] {
  if (raw === undefined || raw.trim() === '') return []
  return raw.split(',').map(part => part.trim()).filter(part => part !== '')
}

/** 将一个 glob 编译为正则（对整段相对路径匹配）。 */
function globToRegExp(glob: string): RegExp {
  let pattern = '^'
  let i = 0
  const source = normalizePosix(glob)
  while (i < source.length) {
    const ch = source[i]!
    if (ch === '*' && source[i + 1] === '*') {
      pattern += '.*'
      i += 2
      if (source[i] === '/') i += 1
      continue
    }
    if (ch === '*') { pattern += '[^/]*'; i += 1; continue }
    if (ch === '?') { pattern += '[^/]'; i += 1; continue }
    if ('\\.()+^$|{}'.includes(ch)) pattern += `\\${ch}`
    else pattern += ch
    i += 1
  }
  pattern += '$'
  return new RegExp(pattern, 'i')
}

/**
 * 判断相对路径是否命中包含/排除规则。
 * @param relativePath 相对工作区根的路径
 * @param include 包含 glob（空表示全部）
 * @param exclude 排除 glob
 */
export function pathAllowed(
  relativePath: string,
  include: string | undefined,
  exclude: string | undefined,
): boolean {
  const posix = normalizePosix(relativePath)
  const base = posix.includes('/') ? posix.slice(posix.lastIndexOf('/') + 1) : posix
  const includes = splitGlobs(include)
  const excludes = splitGlobs(exclude)
  if (includes.length > 0) {
    const hit = includes.some(glob => {
      const re = globToRegExp(glob)
      return re.test(posix) || re.test(base)
    })
    if (!hit) return false
  }
  if (excludes.length > 0) {
    const blocked = excludes.some(glob => {
      const re = globToRegExp(glob)
      return re.test(posix) || re.test(base)
    })
    if (blocked) return false
  }
  return true
}

/**
 * 为 `git grep` 构造 pathspec（include 正选 + `:(exclude)`）。
 * @returns 追加在 `--` 之后的 pathspec 列表；无过滤时为 `['.']`
 */
export function grepPathspecs(include: string | undefined, exclude: string | undefined): readonly string[] {
  const includes = splitGlobs(include)
  const excludes = splitGlobs(exclude)
  const specs: string[] = includes.length === 0 ? ['.'] : [...includes]
  for (const glob of excludes) specs.push(`:(exclude)${glob}`)
  return specs
}
