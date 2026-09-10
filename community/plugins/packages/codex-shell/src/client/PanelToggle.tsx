/** 会话头工具按钮：一键开合底部终端与右侧 Codex 面板。
 * 桌面独立窗口隐藏（开合按钮由顶部栏在窗口控制按钮左侧提供，参考
 * 左侧栏开合按钮的双模式处理）；Web 保留在会话头，顺序为底部栏、
 * 右侧栏，与顶部栏一致。 */

import { PanelBottom, PanelRight } from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import { PanelController, usePanelState } from './panel-controller.js'
import type { TFn } from './faces.js'
import css from './styles.module.css'

export interface PanelToggleInjected {
  panel: PanelController
  meta: SessionMetaStore
  /** 同步宿主 details 列开合（layout.openDetails / closeDetails）。 */
  setColumnOpen: (open: boolean) => void
  /** 同步宿主 bottom 行开合。 */
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

export function PanelToggle({ panel, setColumnOpen, setBottomOpen, t }: PanelToggleProps) {
  const [state] = usePanelState(panel)
  // 桌面壳：开合按钮由顶部栏提供（窗口控制按钮左侧），会话头不渲染。
  if (isDesktopShell()) return null
  const open = state.open
  const label = open ? t('closeRightPanel') : t('openRightPanel')
  return <>
    <button type="button" className={css.iconButton} title={t('bottomTerminal')}
      aria-label={t('bottomTerminal')} onClick={() => { setBottomOpen(true) }}><PanelBottom size={15} /></button>
    <button type="button" className={css.iconButton} title={label}
      aria-label={label} aria-pressed={open}
      onClick={() => { const next = panel.toggle(); setColumnOpen(next.open) }}><PanelRight size={15} /></button>
  </>
}
