/** 会话头工具按钮：一键开合右侧 Codex 面板并同步宿主 details 列。 */

import { PanelRight } from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import { PanelController, usePanelState } from './panel-controller.js'
import type { TFn } from './faces.js'
import css from './styles.module.css'

export interface PanelToggleInjected {
  panel: PanelController
  meta: SessionMetaStore
  /** 同步宿主 details 列开合（layout.openDetails / closeDetails）。 */
  setColumnOpen: (open: boolean) => void
}

export interface PanelToggleProps extends PanelToggleInjected {
  t: TFn
}

export function PanelToggle({ panel, setColumnOpen, t }: PanelToggleProps) {
  const [state] = usePanelState(panel)
  const open = state.open
  const label = open ? t('closeRightPanel') : t('openRightPanel')
  return (
    <button type="button" className={css.iconButton} title={label}
      aria-label={label} aria-pressed={open}
      onClick={() => {
        const next = panel.toggle()
        setColumnOpen(next.open)
      }}>
      <PanelRight size={15} />
    </button>
  )
}
