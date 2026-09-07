/** 文件面板搜索状态：防抖调用文件名与内容搜索，并支持字面量批量替换。 */

import { useCallback, useEffect, useState } from 'react'
import type { CodexApi } from '../../RightPanel.js'
import type { FsSearchOptions } from 'dsh-codex-shell/types'

const SEARCH_DEBOUNCE_MS = 250

export interface FilesSearchForm {
  query: string
  replace: string
  include: string
  exclude: string
  matchCase: boolean
  matchWholeWord: boolean
  useRegex: boolean
  expanded: boolean
}

export interface FilesSearchState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  nameMatches: readonly { path: string; isDir: boolean }[]
  contentMatches: readonly { path: string; line: number; content: string }[]
  truncated: boolean
  error: string | null
  replaceMessage: string | null
}

const idleSearch: FilesSearchState = {
  status: 'idle', nameMatches: [], contentMatches: [], truncated: false, error: null, replaceMessage: null,
}

/**
 * 把表单映射为 Host 搜索选项。
 * @param form 搜索表单
 */
export function toSearchOptions(form: FilesSearchForm): FsSearchOptions {
  return {
    matchCase: form.matchCase,
    matchWholeWord: form.matchWholeWord,
    useRegex: form.useRegex,
    ...(form.include.trim() !== '' ? { include: form.include.trim() } : {}),
    ...(form.exclude.trim() !== '' ? { exclude: form.exclude.trim() } : {}),
  }
}

/**
 * 文件面板搜索 hook。
 * @param api codexShell API
 * @param root 工作区根路径
 * @param form 搜索表单
 * @returns 搜索状态与字面量替换动作
 */
export function useFilesSearch(
  api: CodexApi,
  root: string,
  form: FilesSearchForm,
): { search: FilesSearchState; replaceAll: () => Promise<void> } {
  const [search, setSearch] = useState<FilesSearchState>(idleSearch)
  const options = toSearchOptions(form)
  const query = form.query.trim()

  useEffect(() => {
    if (root === '' || query === '') {
      setSearch(idleSearch)
      return
    }
    const controller = new AbortController()
    setSearch(prev => ({ ...prev, status: 'loading', error: null, replaceMessage: null }))
    const timer = window.setTimeout(() => {
      Promise.all([
        api.fsSearchName(root, query, options),
        api.fsSearchContent(root, query, options),
      ]).then(([names, content]) => {
        if (controller.signal.aborted) return
        setSearch({
          status: 'ready',
          nameMatches: names.matches,
          contentMatches: content.matches,
          truncated: names.truncated || content.truncated,
          error: null,
          replaceMessage: null,
        })
      }).catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setSearch({
          status: 'error',
          nameMatches: [],
          contentMatches: [],
          truncated: false,
          error: reason instanceof Error ? reason.message : String(reason),
          replaceMessage: null,
        })
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [api, root, query, form.matchCase, form.matchWholeWord, form.useRegex, form.include, form.exclude])

  const replaceAll = useCallback(async (): Promise<void> => {
    if (form.useRegex || query === '') return
    const paths = [...new Set(search.contentMatches.map(item => item.path))]
    let ok = 0
    let failed = 0
    for (const path of paths) {
      try {
        const absolute = path.includes(':') || path.startsWith('/') || path.startsWith('\\')
          ? path
          : `${root}\\${path.replaceAll('/', '\\')}`
        const file = await api.fsRead(absolute)
        if (file.kind !== 'text') { failed += 1; continue }
        const next = replaceLiteral(file.content, query, form.replace, form.matchCase)
        if (next === file.content) continue
        await api.fsWrite(absolute, next)
        ok += 1
      } catch {
        failed += 1
      }
    }
    setSearch(prev => ({
      ...prev,
      replaceMessage: failed > 0 ? 'failed' : String(ok),
    }))
  }, [api, form.matchCase, form.replace, form.useRegex, query, root, search.contentMatches])

  return { search, replaceAll }
}

/**
 * 字面量替换（可忽略大小写），避免正则替换对 `$` 的特殊处理。
 * @param content 原文
 * @param query 搜索串
 * @param replacement 替换串
 * @param matchCase 是否区分大小写
 */
function replaceLiteral(content: string, query: string, replacement: string, matchCase: boolean): string {
  if (query === '') return content
  if (matchCase) return content.split(query).join(replacement)
  const lower = query.toLowerCase()
  let result = ''
  let i = 0
  while (i < content.length) {
    if (content.slice(i, i + query.length).toLowerCase() === lower) {
      result += replacement
      i += query.length
    } else {
      result += content[i]
      i += 1
    }
  }
  return result
}
