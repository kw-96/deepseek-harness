/**
 * 右侧面板顶部图标栏：标签横向排列，最多展示 5 个主标签，其余收进
 * 「更多」菜单；激活标签落在溢出集合时顶替第 5 个可见位置。关闭按钮
 * 固定在最右端。
 */
import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, X } from 'lucide-react'
import type { PanelKind } from './panel-controller.js'
import type { TFn } from './faces.js'
import css from './styles.module.css'

/** 一条可切换的面板标签。 */
export interface TabBarTab {
  id: PanelKind
  label: string
  icon: React.ReactNode
}

interface TabBarProps {
  tabs: readonly TabBarTab[]
  activeId: PanelKind
  onSelect: (id: PanelKind) => void
  onClose: () => void
  t: TFn
}

/** 顶部图标栏展示的主标签数量；其余进入溢出菜单。 */
const MAX_TABS = 5

/**
 * 标签条组件。
 * @param tabs 全部标签（按展示优先级排列，前 5 个为主图标）
 * @param activeId 当前激活标签
 * @param onSelect 选择标签回调
 * @param onClose 关闭整个面板回调
 * @param t 文案函数
 */
export function TabBar({ tabs, activeId, onSelect, onClose, t }: TabBarProps): React.ReactNode {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const moreRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 激活标签在溢出集合时顶替第 5 个主标签位置，保证当前页始终可见。
  const active = tabs.find(tab => tab.id === activeId)
  const primary = tabs.slice(0, MAX_TABS)
  const visible = active !== undefined && !primary.some(tab => tab.id === active.id)
    ? [...primary.slice(0, MAX_TABS - 1), active]
    : primary
  const hidden = tabs.filter(tab => !visible.some(item => item.id === tab.id))

  useEffect(() => {
    if (!menuOpen) return
    const dismiss = (event: MouseEvent): void => {
      const target = event.target as Node
      if (menuRef.current !== null && menuRef.current.contains(target)) return
      setMenuOpen(false)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [menuOpen])

  /** 打开/关闭溢出菜单：锚定在按钮下方，避免超出视口右缘。 */
  const toggleMenu = (): void => {
    const rect = moreRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    setMenuPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.right - 204, window.innerWidth - 212)) })
    setMenuOpen(open => !open)
  }

  return (
    <div className={css.tabBar}>
      <div className={css.tabStrip} role="tablist" aria-label={t('panelTool')}>
        {visible.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={tab.id === activeId ? css.tabActive : css.tab}
            aria-selected={tab.id === activeId}
            aria-label={tab.label}
            title={tab.label}
            onClick={() => { onSelect(tab.id) }}
          >
            {tab.icon}
            <span className={css.tabLabel}>{tab.label}</span>
          </button>
        ))}
        {hidden.length > 0 && (
          <button
            ref={moreRef}
            type="button"
            className={css.tab}
            title={t('tabMore')}
            aria-label={t('tabMore')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <MoreHorizontal size={15} />
          </button>
        )}
      </div>
      <button type="button" className={css.tabClose} title={t('closePanel')}
        aria-label={t('closePanel')}
        onClick={onClose}>
        <X size={15} />
      </button>
      {menuOpen && hidden.length > 0 && (
        <div ref={menuRef} className={css.menu} style={{ top: menuPos.top, left: menuPos.left }}>
          {hidden.map(tab => (
            <button key={tab.id} type="button" role="menuitem" className={css.menuItem}
              onClick={() => { setMenuOpen(false); onSelect(tab.id) }}>
              <span className={css.menuIcon}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
