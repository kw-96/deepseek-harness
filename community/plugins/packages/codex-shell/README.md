# dsh-codex-shell

Codex 工作流风格的一体化 DeepSeek Harness Web 插件：把工作区/会话侧栏、开发侧栏项目管理与底部多 tab 交互终端合并进**一个 bundle**。右侧面板由宿主原生 `details` 列提供，本插件不再占用该列。

A Codex-workflow-styled integrated workspace shell for DeepSeek Harness (DSH): the workspace/session sidebar, per-workspace project directories, and a multi-tab bottom terminal in **one bundle plugin**. The right-hand panel belongs to the host's native `details` column; this plugin no longer occupies it.

## 功能 / Features

- **侧栏浏览器**（遮蔽 `sidebar.workspaces`，参考 Codex 左侧栏排布，并隐藏顶部品牌行——DeepSeek 图标与文字）：搜索请求防抖、取消且只展示最新结果；结果与会话/项目树行支持键盘打开和开合；会话行不显示更新时间，标题常态占满可用宽度、仅在超出容器宽度时省略，置顶/归档/更多操作仅在悬浮或选中行时显示；菜单支持外点或 Esc 关闭并避免越出视口；侧栏折叠/展开控制在 Web 下位于顶部（宽态：新会话按钮上方的折叠按钮；轨道态：常显的打开图标），桌面独立窗口不显示（标题栏负责）；「项目」标题栏提供整理（按项目/扁平）与排序（置顶优先/最近更新/手动拖拽），项目组自身同样按置顶 → 最近更新 → 其余排列（项目行悬停可置顶/取消置顶），项目详情改为显式信息按钮；会话提供置顶/归档/更多操作（子代理信息由会话 header 目录呈现，侧栏不再嵌套子代理行）。
- **添加工作区**（标题栏 `+`）：居中目录选择弹窗（路径输入 + 目录浏览 + 创建，基于 `codexShell.fsList`），不复用原生 directoryFlow 槽；侧栏页脚不再显示添加工作区按钮。
- **底部交互终端**：宿主 `bottom` 行的独立多 tab 终端（`pwsh`/`bash` 新建、Agent `terminal_*` 会话可跟随；`@xterm/xterm` 渲染），与模型侧行模式工具并行；列宽/拖拽/动画由宿主布局接管。
- **会话头工具按钮**（`conversation.session.header.utilities`）：Web 下渲染底部终端按钮；桌面独立窗口不渲染（该按钮由顶部栏在窗口控制按钮左侧提供）。右侧面板归宿主官方右栏（`ui-sidebar-right`）：Web 用右栏自带的会话头角落按钮开合，桌面独立窗口用顶部栏的「切换右侧面板」按钮开合。
- **视觉**：完全映射宿主 `--dsw-*` 主题令牌，亮/暗主题自动跟随；侧栏为 Codex 式极简排布（安静分组、单行会话、悬停显露操作）。

## 安装 / Install

```sh
dsh plugin --profile web add file:/path/to/community/plugins/tarballs/dsh-codex-shell-0.6.5.tgz
dsh plugin --profile web remove dsh-codex-shell
```

## 开发 / Develop (source link + hot reload)

保持 `dsh web`（或桌面壳）运行，然后执行：

```sh
node community/plugins/dev.mjs codex-shell
```

脚本会把插件以源码 link 挂载进 web profile、在 `cordis.patch.yml` 启用
Cordis HMR 并指向源码目录，再启动 host/client 双面 watch 构建。之后修改
源码，host 侧由 Cordis HMR 热替换、client 侧由 `client-hmr` 推送浏览器
热重载，无需重启服务或手动刷新页面。

或手动在 profile 的 `cordis.patch.yml` 里 insert：

```yaml
- insert:
    - id: codex-shell
      name: dsh-codex-shell
```

安装后重启 profile（`dsh web`）。插件、MCP 与 Skills 的查看和配置请使用宿主「设置 → 插件」页面（需 `dsh-plugin-manager` 等宿主侧能力），本插件不再提供对应面板。

## 宿主 Remote / Host Remote

`ctx.remote.codexShell`（Typert）：

- `terminalOpen/terminalList/terminalFollow/terminalWrite/terminalResize/terminalClose`（底栏多 tab；`terminalSend`/`terminalRead` 仍保留）
- `fsList`（添加工作区弹窗的目录浏览）
- `projectList/projectCreate/projectRename/projectSetRoots/projectDelete`（侧栏项目层，走宿主 workspaceRegistry）

目录列举经 `ctx.fs`。git 能力（提交历史、变更清单）已移出本插件：见独立的 [`dsh-git-timeline`](../git-timeline/README.md) 右栏标签插件。

## Known Limitations and Deferred Work

- 跨目录「迁项目」需改会话 cwd（本期不做）；同目录归入匹配工作区（`attachSession`）与「移到未分组」（`detachSession`）已闭环。永久工作树 / Cursor 打开器仍待 Host。
- 右侧面板归宿主官方右栏（`ui-sidebar-right`：文件 / 指南 / 文档预览等标签页取决于已安装的右栏标签包）；本插件不再提供文件树 / Git / 命令历史 / 摘要 / 内嵌浏览器面板。Git 时间线在 `dsh-git-timeline` 插件里。
- 附加目录仅登记路径，不接管沙箱权限（不替换 `fs-sandbox`）。
- 添加工作区选择器为插件自带（目录浏览 + 路径输入），不复用原生 directoryFlow 流。
