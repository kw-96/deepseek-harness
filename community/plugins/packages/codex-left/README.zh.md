# dsh-workspace-rail

[English](README.md) | 中文

DeepSeek Harness（DSH）的 Codex 式左侧导航栏：会话浏览器（带持久项目层）、添加工作区弹窗与新建会话页的项目选择器，**单插件组合**。多 tab 底栏终端由单独的 `dsh-codex-shell` 提供——本仓库已于 2026-09-15 下线该插件（源码保留在 git 历史里）；装回它时两者可组合使用，也可各自单独安装。

## 功能

- **侧栏浏览器**（遮蔽 `sidebar.workspaces`，沿用 Codex 左侧栏排布）：搜索请求做防抖与取消，只展示最新结果；结果行与会话/项目树行支持键盘展开与收起；会话行不显示更新时间，标题常态占满可用宽度、仅在超出容器宽度时省略，置顶/归档/更多操作只在悬停或选中行时显示；菜单支持点击外部或 Esc 关闭，并始终留在视口内。
- **侧栏外壳**（占用 `sidebar.brand.name` 与 `sidebar.brand.mark`）：隐藏宿主品牌行（DeepSeek 图标与「DSH 本地构建」文字），Web 宽态压缩行高，轨道态渲染常显的打开图标，桌面独立窗口两种状态都不显示开合控件（由标题栏负责）。
- **项目**：会话先按项目归组（项目根按最长匹配前缀归并工作区），项目列表固定按**置顶 > 最近活动 > 其余**排序，项目行悬停可置顶/取消置顶，「在项目中新建会话」在项目的第一个归属工作区里开会话，`...` 菜单提供重命名 / 管理工作树（增删项目根）/ 归档该组会话 / 删除项目。项目组内有运行中的会话时，项目名旁点亮同款运行圆点。
- **整理与排序**：「整理」菜单切换按项目或单列表、设置聊天排序（置顶优先 / 最近更新 / 手动）、设置自动归档阈值（关闭 / 7 / 14 / 30 / 90 天无活动，默认 30 天，写入侧栏偏好仓）。项目、工作区与归档桶的收起状态在刷新后保持。
- **归档**：会话菜单单条归档；归档会话收进「已归档」桶，行悬停提供「恢复」（走宿主 `unarchiveSession`，原工作区位置不变）。侧栏打开时每 30 分钟扫描一次，跳过运行中、当前选中、空白占位与子代理会话。
- **添加工作区**（`sidebar.footer.action`）：居中目录选择弹窗（路径输入 + 基于 `codexLeft.fsList` 的目录浏览 + 创建），不使用原生 directoryFlow 槽；侧栏页脚不渲染可见按钮——打开入口是侧栏标题栏的 `+` 与桌面标题栏 File → Open Workspace。
- **新建会话页的项目选择器**（遮蔽 `conversation.hero.workspace`）：空会话 hero 的工作区 chip 改为选择**项目**；列出项目（置顶 > 最近）+ 未分组工作区 + 「新建项目…」；多工作区项目先展开工作树，单工作区项目直接开会话，没有归属工作区的项目禁用并说明原因。
- **视觉**：完整映射宿主 `--dsw-*` 主题令牌，自动跟随亮/暗主题；侧栏采用 Codex 式极简排布（安静分组、单行会话、悬停才显露操作）。视觉决策见 [DESIGN.md](DESIGN.md)。

## 与 dsh-codex-shell 的组合

会话菜单「打开方式 → 在终端中打开」调用底栏终端插件的 `codexShell.terminalOpen`。该插件是**可选的**：未挂载 `dsh-codex-shell` 时该项禁用并提示「未安装底栏终端插件（dsh-codex-shell）」。本插件其余功能不依赖它。

## 安装

```sh
dsh plugin --profile web add file:/path/to/community/plugins/tarballs/dsh-workspace-rail-0.1.0.tgz
dsh plugin --profile web remove dsh-workspace-rail
```

## 开发（源码 link + 热替换）

保持 `dsh web`（或桌面壳）运行，然后执行：

```sh
node community/plugins/dev.mjs codex-left
```

脚本把插件以源码 link 挂载进 web profile，在 `cordis.patch.yml` 启用 Cordis HMR 并指向源码目录，随后启动 host/client 双面 watch 构建。之后改源码即可：host 侧由 Cordis HMR 热替换，client 侧由 `client-hmr` 推送浏览器热重载，无需重启服务或手动刷新。

### 代码结构

`src/client/` 按职责分目录：`browser/` 是侧栏浏览器（根组件、树体、`parts/` 渲染件、动作工厂、副作用、搜索外壳），`state/` 是持久化仓与纯投影，`overlays/` 是菜单浮层与弹窗，`index.tsx` / `inject.ts` / `faces.ts` / `locales.ts` 留在根。每个文件夹不超过 8 个文件，每个 TypeScript 文件不超过 200 行。

也可以手动插入 profile 的 `cordis.patch.yml`：

```yaml
- insert:
    - id: workspace-rail
      name: dsh-workspace-rail
```

安装后重启 profile（`dsh web`）。插件/MCP/Skills 的查看与配置走宿主「设置 → 插件」页（需要 `dsh-plugin-manager` 等宿主能力）。

## 宿主 Remote

`ctx.remote.codexLeft`（Typert）：

- `fsList`（添加工作区弹窗、新建项目弹窗与管理工作树的目录浏览）
- `projectList/projectCreate/projectRename/projectSetRoots/projectDelete`（项目层，走宿主 `workspaceRegistry`）

会话、会话搜索、派生与工作区 attach/move/archive 走宿主客户端服务（`ctx.sessions`、`ctx.workspaces`）；本插件不为它们新增 Remote。

## 已知限制与待办

- 项目跨目录迁移需要改会话 cwd（本期未接入）；同目录下把会话挂到匹配工作区（`attachSession`）与「移到未分组」（`detachSession`）已完成。
- 永久工作树 / Cursor 打开器仍待 Host：菜单项保持禁用并给出原因。
- 「在终端中打开」需要 `dsh-codex-shell`；未安装时该项禁用。
- 添加工作区选择器随插件自带（目录浏览 + 路径输入），不复用原生 directoryFlow 流程。
