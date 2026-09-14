/**
 * 侧栏顶部品牌区控制（占用 sidebar.brand.mark 槽）：
 * - 宽态 Web：隐藏品牌按钮本身，保留壳层行与行内折叠按钮（位于
 *   新会话按钮上方），并压缩行高避免大片空白；
 * - 宽态桌面壳：整行隐藏（标题栏已提供开合）；
 * - 轨道态 Web：渲染常显的「打开侧栏」图标（壳层展开按钮即本槽内容，
 *   不再需要悬浮才出现）；
 * - 轨道态桌面壳：隐藏展开按钮（标题栏已提供开合）。
 */

import { useEffect, useRef } from 'react'
import { PanelLeftOpen } from 'lucide-react'

/** 是否运行在 Tauri 桌面壳（与 ui-layout 的探测一致）。 */
function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false
  const candidate = window as Window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }
  return candidate.__TAURI_INTERNALS__ !== undefined || candidate.__TAURI__ !== undefined
}

/** 侧栏顶部品牌区控制组件。 */
export function SidebarBrandControls(): React.ReactNode {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const anchor = ref.current
    if (anchor === null) return
    const button = anchor.closest('button')
    if (button === null) return
    const desktop = isDesktopShell()
    const row = button.parentElement
    const wide = button.querySelector('[data-slot="sidebar.brand.name"]') !== null
    if (wide) {
      // 宽态：品牌按钮隐藏；桌面壳连整行一起隐藏（行内无其它控件）。
      button.style.display = 'none'
      if (desktop) {
        if (row !== null) row.style.display = 'none'
        return () => {
          button.style.display = ''
          if (row !== null) row.style.display = ''
        }
      }
      // Web：压缩空品牌行，让壳层折叠按钮贴住新会话按钮上方。
      const priorHeight = row?.style.height ?? ''
      const priorPadding = row?.style.padding ?? ''
      if (row !== null) {
        row.style.height = '28px'
        row.style.padding = '0 4px'
      }
      return () => {
        button.style.display = ''
        if (row !== null) {
          row.style.height = priorHeight
          row.style.padding = priorPadding
        }
      }
    }
    // 轨道态：桌面壳隐藏展开按钮，Web 保留（本组件渲染常显打开图标）。
    if (desktop && row !== null) {
      row.style.display = 'none'
      return () => { row.style.display = '' }
    }
    return undefined
  }, [])
  return (
    <>
      <div ref={ref} style={{ display: 'none' }} />
      <PanelLeftOpen size={18} aria-hidden="true" />
    </>
  )
}
