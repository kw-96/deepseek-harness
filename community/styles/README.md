# community/styles — 移动端适配样式源码

这里保存**已从 `packages/` 还原成官方实现**的移动端样板式定制源码，作为备份与后续参考。

## 为什么放在这里

官方 `packages/client/*` 使用 CSS Modules（scoped 类名），把手机端适配直接改在组件样式表里，会把定制写进官方包内部，升级时逐行冲突。因此这些适配改为由 [`dsh-remote-mobile`](https://github.com/IceApriler/dsh-remote-mobile) 的**样式片段**功能承担——它在服务端按需注入全局 `<style>`，支持 PC / 移动端分别启停，不触碰官方源码。

## 运行时位置

插件的样式片段存储在两个位置：

| 位置 | 作用 |
|---|---|
| `~/.dsh/remote-mobile/style-snippets.json` | 生效的片段（内置预设的启停状态 + 自定义片段内容） |
| 桌面端「设置 → 远程与移动端 → 本地数据」 | 面板入口，可复制路径、逐条启停 |

插件的内置预设已覆盖大部分场景（侧边栏抽屉导航、设置面板适配、正文紧凑排版），默认**仅移动端启用**。

## 覆写技巧（CSS Modules 类名怎么选中）

样式片段是全局 CSS，选不到 CSS Modules 的 scoped 类名。插件预设用的是这三类锚点，优先级从高到低：

1. **官方 `data-*` 属性** —— 最稳，如 `[data-composer-card="true"]`、`[data-slot^="conversation.chat"]`
2. **类名子串匹配** —— `[class*="_centerCol"]` 能命中编译后的 `ConversationRoot_centerCol__abc12`
3. **`:has()` 精确定位父级** —— 如 `[class*="_root"]:has(> [data-composer-card="true"])`

自定义片段必须带 `!important`，因为官方单类选择器的特异性低于带属性的选择器。

## 文件

| 文件 | 来源 | 现在由谁承担 |
|---|---|---|
| `mobile-adaptation.css` | 原 `packages/client/ui-conversation`、`ui-settings-general`、`ui-primitives` 中的移动端媒体查询 | 见文件内逐段标注 |

## 组件行为（不在样式片段范围内）

样式片段只能改几何与外观，改不了组件里的行为决策。当前仍留在 `packages/` 内、且**不属于**本目录范围的只剩一处：

- `ui-settings-general/src/client/SettingsRoot.tsx` —— 监听桌面壳标题栏菜单发出的 `dsh-desktop:command` 事件（桌面端专有，与移动端无关）。

原 `ui-conversation/src/client/skeleton/InputBar.tsx` 的键盘面聚焦判定与「添加附件」按钮、`ui-sidebar-right/src/client/shell/SidebarRight.tsx` 的 `noTrack` 判据已在 2026-09-24 移除，官方包恢复为逐字节官方版本：查证确认这两处在现有扩展点下无法插件化（聚焦发生在组件自身 effect 内，右栏的 `setExpanded` 由组件私有 store 驱动，均无公开 slot 或服务可用），故不再保留。
