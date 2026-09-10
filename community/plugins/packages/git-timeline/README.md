# dsh-git-timeline

DeepSeek Harness（DSH）的 **Git 时间线**右栏标签：在官方右侧边栏（`ui-sidebar-right`）里查看某个文件的提交历史——VSCode / Cursor 的 IDE 时间线那种形态。

A Git timeline tab for the DSH official right sidebar: commit history for one file, IDE-timeline style.

## 功能 / Features

- **右栏标签类型**（`ctx.sidebarRightTabs` 注册，kind = `git-timeline`）：在右栏的「指南」页出现「Git 时间线」入口胶囊，点开即成为一个右栏标签页；与「文件」「文档预览」等标签并列，互不干扰。
- **路径筛选**：输入框按**仓库根相对路径**过滤（留空 = 整个仓库）；输入停止 300 毫秒后自动应用，回车立即应用。
- **变更文件快捷选择**：顶部列出当前工作区有改动的文件（`git status`，最多 12 个，带单字母状态），点一下即把时间线切到该文件。
- **时间线**：每条提交显示主题、短哈希、作者、相对时间与分支/标签引用；空仓库、非 Git 仓库、读取失败都有对应空态。
- **只读**：宿主侧只跑 `git rev-parse` / `git log` / `git status`，没有任何写操作。

## 安装 / Install

```sh
dsh plugin --profile web add file:/path/to/community/plugins/tarballs/dsh-git-timeline-0.1.0.tgz
dsh plugin --profile web remove dsh-git-timeline
```

或手动在 profile 的 `cordis.patch.yml` 里 insert：

```yaml
- insert:
    - id: git-timeline
      name: dsh-git-timeline
```

## 开发 / Develop（源码 link + 热替换）

保持 `dsh web` 运行，然后执行：

```sh
node community/plugins/dev.mjs git-timeline
```

脚本把插件以 junction 挂载进 web profile、在 `cordis.patch.yml` 启用 Cordis HMR 并指向源码目录，随后启动 host/client 双面 watch 构建：改源码后 host 侧热替换、client 侧推送到浏览器。

单独构建与测试：

```sh
cd community/plugins/packages/git-timeline
pnpm run build     # tsc + tsdown（host/client 双面）
pnpm test          # vitest
```

## 宿主 Remote / Host Remote

`ctx.remote.gitTimeline`（Typert，命名空间 `gitTimeline`）：

- `log(cwd, path?, count?)` → `{ repo, root, error, entries[] }`：`cwd` 为会话工作目录，`path` 为仓库根相对（或绝对）路径，`count` 默认 50、上限 200。
- `changed(cwd)` → `{ repo, root, error, files[] }`：`files[]` 为 `git status --porcelain=v1 -z` 的投影（`path` / `origPath` / `status`），上限 500 条。

两条都在 `ctx.shell` 上执行 git（超时 30 秒），失败以 `error` 字段回传而不是抛给界面。

## 依赖的宿主能力 / Host requirements

- 宿主需挂载 `@deepseek-ai/dsh-client-ui-sidebar-right`（提供 `sidebarRightTabs` 注册表与 `sidebar.right.pane.tab` 席位）；缺失时本插件保持待命，不报错。
- 右栏的开合入口由官方右栏自己的会话头角落按钮负责（Web）/ 桌面顶栏按钮（独立窗口）。

## Known Limitations and Deferred Work

- 只会读**当前会话工作区所属**仓库；跨仓库或多仓库工作区不做切换。
- 时间线按路径筛选提交，不展示每次提交的文件清单与差异（点开差异属后续工作）。
- 提交条数上限 200、变更文件上限 500，超出的部分不提示截断。
