/**
 * 工单控制面的客户端入口：把控制面注册为右侧栏的一个页面标签。
 *
 * 控制面本身由 Host 面挂载在 /workorder-agent，这里只做两件事：向官方的右栏
 * 标签注册表登记一个页面类型，并把它的正文与标题注册到对应的槽位。登记过的
 * 类型会出现在右栏「指南」页的入口列表里，点一下就按 kind 打开。
 *
 * 这里不导入 DSH 的类型包：社区插件只依赖运行时的服务名，避免额外的类型解析。
 */
import { WorkorderTabBody } from './WorkorderTabBody.js'
import { WorkorderTabTitle } from './WorkorderTabTitle.js'

/** 需要右栏标签注册表与槽位注册表；两者都由官方 ui-sidebar-right 提供。 */
export const inject = ['sidebarRightTabs', 'slots']

/** 本实现的身份，也是正文与标题在各自槽位里的 key。 */
const TAB_ID = 'workorder-agent/panel'

/** 类型判别符：右栏按它打开控制面，因此必须与官方已注册的类型不重名。 */
const TAB_KIND = 'workorder-panel'

/** 标签 chip 上的文字。 */
const TAB_LABEL = '工单'

/** 指南页入口列表里的一项。 */
const GUIDE_ENTRY = {
  id: 'workorder-panel',
  order: 140,
  title: () => '工单控制面',
  description: () => '易协作工单查询、填写核验与巡检发送',
}

/**
 * 注册右栏「工单」标签：类型、正文、标题三处，缺一处右栏就画不出这个标签。
 * @param ctx 客户端 Cordis 上下文（此处按运行时约定使用，不引入 DSH 类型包）
 */
export function apply(ctx: any): void {
  ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: TAB_KIND,
    priority: 'extension',
    title: () => TAB_LABEL,
    guide: [GUIDE_ENTRY],
  })
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
  }, WorkorderTabBody))
  ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: TAB_ID,
  }, WorkorderTabTitle))
}
