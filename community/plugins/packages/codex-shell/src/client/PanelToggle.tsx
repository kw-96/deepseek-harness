/** 会话头工具按钮：一键打开底部终端面板。
 * 桌面独立窗口隐藏（开合按钮由顶部栏在窗口控制按钮左侧提供，参考
 * 左侧栏开合按钮的双模式处理）；右侧面板由官方右栏（ui-sidebar-right）
 * 自己的会话头角落按钮负责开合，本插件不再渲染第二个右侧开合按钮。 */

import { PanelBottom } from 'lucide-react'
import type { TFn } from './faces.js'
import css from './styles.module.css'

export interface PanelToggleInjected {
  /** 打开底部终端行（ctx.layout.openBottom）。 */
  setBottomOpen: (open: boolean) => void
}

export interface PanelToggleProps extends PanelToggleInjected {
  t: TFn
}

/** 是否运行在 Tauri 桌面壳（与 index.tsx / ui-layout 的探测一致）。 */
function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false
  const candidate = window as Window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }
  return candidate.__TAURI_INTERNALS__ !== undefined || candidate.__TAURI__ !== undefined
}

export function PanelToggle({ setBottomOpen, t }: PanelToggleProps): React.ReactNode {
  // 桌面壳：开合按钮由顶部栏提供（窗口控制按钮左侧），会话头不渲染。
  if (isDesktopShell()) return null
  return (
    <button type="button" className={css.iconButton} title={t('bottomTerminal')}
      aria-label={t('bottomTerminal')} onClick={() => { setBottomOpen(true) }}><PanelBottom size={15} /></button>
  )
}
