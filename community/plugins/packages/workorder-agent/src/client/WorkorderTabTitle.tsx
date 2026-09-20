/**
 * 右栏「工单」标签的标题：图标加文字，与同排的其它标签 chip 同高。
 *
 * 图标与 Host 面侧边栏入口用的是同一个剪贴板清单图形，两处入口看起来是一件事。
 */
import type { ReactNode } from 'react'

/** 标签在 chip 里的显示文字。 */
const TAB_LABEL = '工单'

/**
 * 标题 chip。
 * @returns 图标加文字的标题元素
 */
export function WorkorderTabTitle(): ReactNode {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <svg
        viewBox="0 0 24 24"
        width={14}
        height={14}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="8" y="3" width="8" height="4" rx="1" />
        <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
        <path d="M9 12h6M9 16h4" />
      </svg>
      <span>{TAB_LABEL}</span>
    </span>
  )
}
