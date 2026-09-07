/**
 * 可嵌套菜单原语：主项、禁用项、悬停展开的子菜单飞出层。
 */

import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { TFn } from '../faces.js'
import css from '../styles.module.css'

export interface MenuItemProps {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  disabled?: boolean
  disabledReason?: string
  onClick?: () => void
  trailing?: React.ReactNode
}

/** 单条菜单项；禁用时显示 title 说明原因。 */
export function MenuItem(props: MenuItemProps): React.ReactNode {
  const className = props.danger
    ? `${css.menuItem} ${css.menuItemDanger}`
    : props.disabled
      ? `${css.menuItem} ${css.menuItemDisabled}`
      : css.menuItem
  return (
    <button
      type="button"
      className={className}
      disabled={props.disabled === true}
      title={props.disabled === true ? props.disabledReason : undefined}
      onClick={() => {
        if (props.disabled === true || props.onClick === undefined) return
        props.onClick()
      }}
    >
      {props.icon !== undefined && <span className={css.menuIcon}>{props.icon}</span>}
      <span className={css.menuItemLabel}>{props.label}</span>
      {props.trailing}
    </button>
  )
}

export interface SubmenuProps {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
  t: TFn
}

/** 悬停向右展开的子菜单。 */
export function Submenu(props: SubmenuProps): React.ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={css.submenuAnchor}
      onMouseEnter={() => { setOpen(true) }}
      onMouseLeave={() => { setOpen(false) }}
    >
      <button type="button" className={css.menuItem} aria-haspopup="menu" aria-expanded={open}>
        {props.icon !== undefined && <span className={css.menuIcon}>{props.icon}</span>}
        <span className={css.menuItemLabel}>{props.label}</span>
        <ChevronRight size={13} className={css.menuChevron} />
      </button>
      {open && (
        <div className={css.submenuFlyout} role="menu" aria-label={props.label}>
          {props.children}
        </div>
      )}
    </div>
  )
}

/** 菜单分隔线。 */
export function MenuSep(): React.ReactNode {
  return <div className={css.menuSep} />
}
