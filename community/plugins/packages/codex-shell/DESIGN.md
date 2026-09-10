# dsh-codex-shell DESIGN.md

Replacement visual world, v5: **Codex 式极简侧栏 + 宿主令牌**。侧栏工作区
面板参考 Codex 左侧栏的界面排布与 UI 设计 —— 常驻圆角搜索框、细字工作区
标题、单行会话、悬停才显露的时间与操作，视觉噪声最小化；全部颜色映射
DeepSeek Harness 的 `--dsw-*` 主题别名（亮/暗自动跟随）。布局上是真正的
三栏工作区：左栏浏览器填充宿主侧栏浏览区，右栏工作台停靠进宿主 `details`
第三列，与原生列宽、拖拽手柄、开合动画同构。

## 颜色令牌

`--cx-*` 保留为插件内部别名，全部映射到宿主语义令牌（light/dark 自动）：

| 插件别名 | 宿主来源 | 用途 |
|---|---|---|
| `--cx-bg` | `--dsw-specific-sidebar-fill` | 侧栏画布 |
| `--cx-bg-surface` | `--dsw-alias-bg-base` | 右栏面板表面 |
| `--cx-bg-raised` | `--dsw-alias-bg-overlay` | 弹出菜单、选择弹窗 |
| `--cx-bg-inset` | `--dsw-alias-bg-module-platform` | 输入框、搜索条 |
| `--cx-text-hi/mid/low` | `--dsw-alias-label-primary/secondary/tertiary` | 三级文本 |
| `--cx-line/line-strong` | `--dsw-alias-border-l1/l3` | 发丝描边 |
| `--cx-accent` | `--dsw-alias-brand-primary` | 焦点环、主按钮 |
| `--cx-accent-strong` | `--dsw-alias-state-business-primary` | 运行态、强调 |
| `--cx-accent-muted` | `--dsw-alias-interactive-bg-hover-accent` | 激活着色 |
| `--cx-hover/active` | `--dsw-alias-interactive-bg-hover/active` | 悬停/按压填充 |
| `--cx-current` | `--dsw-specific-sidebar-nav-item-active` | 当前会话行填充 |
| `--cx-success/error/warn/info` | `--dsw-alias-state-*-primary` | 状态语义色 |

插件自有装饰（置顶、未读、运行态）全部落在上述别名上，不引入
任何独立色值。

## 排版

- 搜索框输入 13px；工作区标题 13px / 600（弱化色、轻字距）
- 会话行标题 14px / 500，超出容器宽度单行省略（会话行不显示相对时间）
- 工作区与会话形成两档字体层级
- 搜索结果：标题 13px + 摘要 11px；面板标题 14px / 500
- 代码与测量数字用 `--ds-font-family-code` 等宽与表格数字

## 形状、空间、层级

- 圆形图标按钮（28px / 轨道 36px / 页脚 32px 文字按钮）
- 固定行高：工作区标题 26px、会话行 32px（超长一律省略号截断）
- 圆角：侧栏会话行/项目头/搜索结果的悬停与选中高亮为直角（无圆角），文件行 8px；搜索框与输入 10px、菜单 12px、弹窗 14px
- 阴影与动效来自宿主令牌（`--dsw-elevation-prominent`、`--ds-ease-*`）

## 左侧栏

- 只填充 shell 的 `sidebar.workspaces` 区域：壳层自带的品牌行、新会话按钮
  与底部设置区原样保留，插件不重复渲染。
- 排布参考 Codex 左侧栏：常驻圆角搜索框 → 工作区标题行（名称前是工作区
  文件夹图标：展开 = 打开文件夹、收起 = 闭合文件夹，代替收起箭头）→
  单行会话；折叠轨道态只保留搜索 36px 圆形控件。
- 会话归属：先按工作区收纳会话，组内再按最近使用（updatedAt 降序）向下
  排列；未分组与归档同样按最近使用排序。
- 视觉噪声最小化：状态点只在“运行中”点亮；置顶/未读为小号常驻标记；
  无目录副行、无计数；时间与操作仅悬停显露。
- 行菜单（fork/重命名/归档/复制 cwd/id/深链接/新窗口打开）经 … 按钮
  派发；工作区菜单另含“在此工作区新建会话”。
- 添加工作区入口停靠侧栏页脚（`sidebar.footer.action`，宽态文字按钮、
  轨道态圆形图标），打开居中的目录选择弹窗（codexShell `fsList`），
  不依赖被遮蔽的原生 `sidebar.workspaces.directoryFlow` 槽 —— 该槽的
  声明始终由原生条目持有，插件既不能重新声明也不能渲染它。

## 右侧面板

- 停靠进宿主 `details` 列（priority -1 遮蔽原生工具详情面板）。列宽
  （默认 360px，300–520px 钳制）、拖拽手柄、窄屏让步与开合动画全部由宿主
  布局接管；插件只填充列内部。
- 结构：44px 竖向活动栏（图标 + 提示 + aria 标签）+ 标题头 + 工作台主体；
  关闭按钮钉在活动栏底部，同时收起宿主列。
- 首次激活默认展开；会话切换后自动重新展开（会话作用域条目随切换重挂载，
  挂载 effect 是列开合的最后一次写入）。用户手动开合写入 localStorage。

## 动效

宿主令牌驱动；面板自身不再有入场动画（列的滑动即动画）。减少动态偏好
关闭全部过渡与动画。

## 状态

default / hover / active / focus-visible / disabled / loading / error / empty。
空态教下一步动作；加载用安静骨架屏或共享 spinner。

## 规则

- 只通过 CSS Modules 与 `--cx-*`（映射 `--dsw-*`）样式；不触碰宿主全局样式
  与宿主 DOM。
- 永不重新声明 `sidebar.workspaces.directoryFlow`；永不声明
  `conversation.details.tool`（两者都由被遮蔽的原生条目持有）。
- 图标统一 lucide，单一视觉重量；状态色只用宿主语义令牌。
