/**
 * 右栏「工单」标签的正文：用同源 iframe 内嵌 /workorder-agent 控制面。
 *
 * 控制面本身就是一套完整的独立页面（自带导航与九个业务页面），这里不重写它，
 * 只用官方右栏把这个入口收进来。相对地址在两种外壳下都成立：Web 由同一源提供，
 * 桌面壳把 dsh-app://app/<path> 按路径转发给本机 Host。
 */
import type { ReactNode } from 'react'

/** 控制面在 Host 上的挂载路径。 */
const CONTROL_PANEL_PATH = '/workorder-agent'

/** iframe 铺满标签内容区；背景跟随外层面板的语义色，避免加载间隙闪白。 */
const frameStyle: Record<string, string> = {
  display: 'block',
  width: '100%',
  height: '100%',
  border: 'none',
  background: 'var(--dsw-surface, #1c1f26)',
}

/**
 * 内嵌工单控制面。
 * @returns iframe 元素
 */
export function WorkorderTabBody(): ReactNode {
  return <iframe src={CONTROL_PANEL_PATH} title="工单控制面" style={frameStyle} />
}
