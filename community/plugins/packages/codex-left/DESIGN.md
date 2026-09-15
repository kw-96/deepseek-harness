# dsh-workspace-rail DESIGN.md

左侧导航栏的视觉世界，v6：**Codex 式极简侧栏 + 宿主令牌**。侧栏工作区面板参考
Codex 左侧栏的界面排布与 UI 设计 —— 常驻圆角搜索框、细字工作区/项目标题、单行
会话、悬停才显露的操作，视觉噪声最小化；全部颜色映射 DeepSeek Harness 的
`--dsw-*` 主题别名（亮/暗自动跟随）。左侧栏填充宿主侧栏浏览区，右侧 `details`
列留给宿主原生面板，本插件不参与其视觉。

## 颜色令牌

`--cx-*` 保留为插件内部别名，全部映射到宿主语义令牌（light/dark 自动）：

| 插件别名 | 宿主来源 | 用途 |
|---|---|---|
| `--cx-bg` | `--dsw-specific-sidebar-fill` | 侧栏画布 |
| `--cx-bg-surface` | `--dsw-alias-bg-base` | 弹窗表面 |
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

插件自有装饰（置顶、未读、运行态）全部落在上述别名上，不引入任何独立色值。
`dsh-codex-shell` 的底栏终端复用同一套别名，两边各自内联自己的 CSS。

## 排版

- 搜索框输入 13px；工作区/项目标题 13px / 600（弱化色、轻字距）
- 会话行标题 14px / 500，超出容器宽度单行省略（会话行不显示相对时间）
- 工作区与会话形成两档字体层级
- 搜索结果：标题 13px + 摘要 11px；面板标题 14px / 500
- 代码与测量数字用 `--ds-font-family-code` 等宽与表格数字

## 形状、空间、层级

- 圆形图标按钮（28px / 轨道 36px / 页脚 32px 文字按钮）
- 固定行高：工作区标题 26px、会话行 32px（超长一律省略号截断）
- 圆角：侧栏会话行/项目头/搜索结果的悬停与选中高亮为直角（无圆角），目录浏览行 8px；搜索框与输入 10px、菜单 12px、弹窗 14px
- 阴影与动效来自宿主令牌（`--dsw-elevation-prominent`、`--ds-ease-*`）

## 左侧栏

- 只填充 shell 的 `sidebar.workspaces` 区域：壳层自带的品牌行、新会话按钮
  与底部设置区由本插件另行接管（品牌行隐藏并压缩，见 `sidebar.brand.mark`
  与 `sidebar.brand.name` 槽），其余原样保留。
- 排布参考 Codex 左侧栏：常驻圆角搜索框 → 工作区/项目标题行（名称前是文件夹
  图标：展开 = 打开文件夹、收起 = 闭合文件夹，代替收起箭头）→ 单行会话；
  折叠轨道态只保留搜索 36px 圆形控件。
- 会话归属：先按项目归组（无项目时按工作区），组内再按最近使用（updatedAt
  降序）向下排列；未分组与归档同样按最近使用排序。
- 视觉噪声最小化：状态点只在“运行中”点亮；置顶/未读为小号常驻标记；
  无目录副行、无计数；时间与操作仅悬停显露。
- 行菜单（派生/重命名/归档/复制 cwd/深链接/新窗口打开，以及项目归属与
  「在终端中打开」）经 … 按钮派发；工作区菜单另含“在此工作区新建会话”。
- 添加工作区入口是居中的目录选择弹窗（`codexLeft.fsList` 浏览 + 路径输入 +
  创建），挂在侧栏页脚槽位但页脚不渲染可见按钮；打开入口为侧栏标题栏「+」与
  桌面 File → Open Workspace。不依赖被遮蔽的原生
  `sidebar.workspaces.directoryFlow` 槽 —— 该槽的声明始终由原生条目持有，
  插件既不能重新声明也不能渲染它。

## 新建会话页

- 遮蔽 `conversation.hero.workspace`（priority -1）：chip 弹层列出项目
  （置顶 > 最近）+ 未分组工作区 + 「新建项目…」；多工作区项目展开工作树二级
  选择，单工作区项目直接开会话，无归属工作区的项目禁用并说明原因。
- 弹层用 `createPortal` 挂到 body 并按 chip 锚点定位（滚动/缩放跟随），
  因此 `react-dom` 必须保持外置，不能打进插件产物。

## 动效

宿主令牌驱动；面板自身不再有入场动画（列的滑动即动画）。减少动态偏好
关闭全部过渡与动画。

## 状态

default / hover / active / focus-visible / disabled / loading / error / empty。
空态教下一步动作；加载用安静占位文本（`loading` 文案）。

## 规则

- 只通过 CSS Modules 与 `--cx-*`（映射 `--dsw-*`）样式；不触碰宿主全局样式
  与宿主 DOM。
- 永不重新声明 `sidebar.workspaces.directoryFlow`；永不声明 `details` 或
  `conversation.details.tool`（原生面板与其工具位始终由宿主包持有）。
- 图标统一 lucide，单一视觉重量；状态色只用宿主语义令牌。
