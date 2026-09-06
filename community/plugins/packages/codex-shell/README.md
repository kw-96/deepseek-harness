# dsh-codex-shell

Codex 工作流风格的一体化 DeepSeek Harness Web 插件：把工作区/会话侧栏、右侧文件与 Git 工作台、附加目录项目管理、插件管家、命令历史、固定摘要和内嵌浏览器合并进**一个 bundle**，并把 Web 界面变成持久的三栏工作区（侧栏 | 对话 | 工作台）。

A Codex-workflow-styled integrated workspace shell for DeepSeek Harness (DSH): the workspace/session sidebar, a docked right-side files & git workbench, per-workspace project directories, the plugin manager, command history, pinned summaries, and an embedded browser in **one bundle plugin**, turning the Web GUI into a persistent three-column workspace.

## 功能 / Features

- **侧栏浏览器**（遮蔽 `sidebar.workspaces`，参考 Codex 左侧栏排布）：常驻圆角搜索框；会话先按工作区收纳、组内按最近使用向下排列；工作区标题行（名称前是文件夹图标，展开=打开/收起=闭合；折叠/重命名/删除/在此工作区新建会话）；单行会话固定行高（运行态亮点、置顶/未读小标记、悬停显露时间与 `…` 菜单：派生/重命名/归档/复制 cwd/id/深链接/新窗口打开）；工作区与会话名称超长省略；子代理嵌套树。
- **添加工作区**（`sidebar.footer.action` 页脚入口）：居中目录选择弹窗（路径输入 + 目录浏览 + 创建，基于 `codexShell.fsList`），不复用原生 directoryFlow 槽。
- **右侧工作台面板**（停靠进宿主 `details` 第三列，priority -1）：文件树 + 文本预览与保存、Git 状态/差异/提交/历史/分支、附加目录管理（按工作区持久化于 `$DSH_HOME/storages/dsh-codex-shell/dirs.json`）、内嵌插件管家（运行时清单启停 + 市场安装）、会话命令历史、固定摘要笔记、内嵌浏览器（iframe）。列宽/拖拽/动画由宿主布局接管；首次加载默认展开，会话切换自动保持展开。
- **会话头工具按钮**（`conversation.session.header.utilities`）：一键开合右侧工作台面板，与宿主列双向同步。
- **视觉**：完全映射宿主 `--dsw-*` 主题令牌，亮/暗主题自动跟随；侧栏为 Codex 式极简排布（安静分组、单行会话、悬停显露操作）。

## 安装 / Install

```sh
dsh plugin --profile web add dsh-codex-shell@0.4.0
```

或手动在 profile 的 `cordis.patch.yml` 里 insert：

```yaml
- insert:
    - id: codex-shell
      name: dsh-codex-shell
```

安装后重启 profile（`dsh web`）。插件管家面板需要 `dsh-plugin-manager` 与 `@ruihuahe/dsh-plugin-marketplace` 同时安装；未安装时该 tab 显示不可用提示，其余功能不受影响。

## 宿主 Remote / Host Remote

`ctx.remote.codexShell`（Typert）：

- `fsList/fsRead/fsWrite/fsSearchName/fsSearchContent`
- `gitStatus/gitLog/gitDiff/gitStage/gitUnstage/gitDiscard/gitCommit/gitBranches/gitCheckout`
- `projectDirs/projectSetDirs/projectAddDir`

文件操作经 `ctx.fs`，git 经 `ctx.shell`（`git` 命令，30s 超时）。

## Known Limitations and Deferred Work

- 文件预览上限 512KB（`fsRead` 截断）；内容搜索走 `git grep`（只搜已跟踪文件）。
- 右侧面板占用宿主 `details` 列：插件激活期间原生工具详情面板被遮蔽（对话内的工具卡片仍完整展示参数与结果）；卸载后自动恢复。若需工具详情与插件面板并存，需宿主为 details 列提供扩展标签槽，属宿主侧后续工作。
- `gitDiscard` 为破坏性操作，客户端有确认弹窗，宿主端不做二次校验。
- 附加目录仅登记路径，不接管沙箱权限（不替换 `fs-sandbox`）。
- 添加工作区选择器为插件自带（目录浏览 + 路径输入），不复用原生 directoryFlow 流。
