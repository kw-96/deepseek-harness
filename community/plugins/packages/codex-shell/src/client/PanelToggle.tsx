/** Conversation-header utility button toggling the Codex right panel. */

import { PanelRight } from 'lucide-react'
import type { SessionMetaStore } from './session-meta.js'
import { PanelController } from './panel-controller.js'
import type { TFn } from './faces.js'
import css from './styles.module.css'

export interface PanelToggleInjected {
  panel: PanelController
  meta: SessionMetaStore
}

export interface PanelToggleProps extends PanelToggleInjected {
  t: TFn
}

export function PanelToggle({ panel, t }: PanelToggleProps) {
  return (
    <button type="button" className={css.iconButton} title={t('openRightPanel')}
      aria-label={t('openRightPanel')}
      onClick={() => { panel.toggle() }}>
      <PanelRight size={15} />
    </button>
  )
}
