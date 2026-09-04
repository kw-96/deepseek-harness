# dsh-codex-shell

Codex 风格的一体化 DeepSeek Harness Web 插件：把工作区/会话侧栏、右缘文件与 Git 工作台、附加目录项目管理、插件管家、命令历史、固定摘要和内嵌浏览器合并进**一个 bundle**。

A Codex-styled integrated workspace shell for DeepSeek Harness (DSH), merging the workspace/session sidebar, a right-edge files & git workbench, per-workspace project directories, the plugin manager, command history, pinned summaries, and an embedded browser into **one bundle plugin**.

## 功能 / Features

- **侧栏浏览器**（替换 `sidebar.workspaces`）：Codex App 风格的工作区分组、会话状态点、搜索、置顶/未读标记、右键菜单（派生/重命名/归档/复制 cwd/id/深链接/新窗口打开）、拖目录建工作区（复用原生 directoryFlow 槽）。
- **右缘面板**（`shell.overlay`）：文件树 + 文本预览与保存、Git 状态/差异/提交/历史/分支、附加目录管理（`dsh-codex-project` 平替，按工作区持久化于 `$DSH_HOME/storages/dsh-codex-shell/dirs.json`）、内嵌插件管家（运行时清单启停 + 市场安装）、会话命令历史、固定摘要笔记、内嵌浏览器（iframe）。
- **会话头工具按钮**（`conversation.session.header.utilities`）：一键开合右缘面板。
- **Codex 视觉**：深色中性底、发丝描边、Codex 蓝强调，全部落在 `--cx-*` token 上；右缘面板使用竖向活动栏 + 标题头。

## 安装 / Install

```sh
dsh plugin --profile web add dsh-codex-shell@0.1.0
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
- 右缘面板以浮层方式贴右缘（`shell.overlay`），不占用 `details` 列——原生工具详情面板保持可用；列式布局集成是后续工作。
- `gitDiscard` 为破坏性操作，客户端有确认弹窗，宿主端不做二次校验。
- 附加目录仅登记路径，不接管沙箱权限（不替换 `fs-sandbox`）。
