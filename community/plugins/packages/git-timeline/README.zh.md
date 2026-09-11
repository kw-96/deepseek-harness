# dsh-git-timeline

[English](README.md) | 中文

DeepSeek Harness（DSH）官方右栏（`ui-sidebar-right`）里的**完整 Git 面板**：变更提交、提交图（Graph）、远程同步，以及用当前会话模型一键生成提交信息。

> 包名沿用历史命名 `dsh-git-timeline`；面板本身已从「时间线」扩展为完整 Git 面板（标签名 **Git**，tab kind `git`）。

## 布局

```
┌ Changes（固定占面板一半高度，内部滚动） ─────────────┐
│  提交信息输入框                                    ✨ │  ← ✨ 用当前会话模型生成提交信息
│  [ 提交            ][▾]                             │  ← ▾ 切换：提交 / 提交(修改) / 提交和推送 / 提交和同步
│  已暂存 (n)   全部取消暂存                           │
│    M  GitBody.tsx   src/client/            hover: −  │
│  更改 (n)     全部暂存                               │
│    U  notes.md      docs/                  hover: +  │
├ Graph（内部滚动） ─────────────────────────────────┤
│  Graph          ⌖  ☁︎  ↓  ↑  ⟳                      │  ← 定位/抓取/拉取/推送/刷新
│  ●─┐  整理 Git 面板        [dev]                     │  ← 泳道 + 提交标题 + 分支/标签徽标
│  │ ●  修复别名冲突         [tag: v0.2.0]             │
├ 底部栏（固定） ────────────────────────────────────┤
│  ⎇ dev ↑1 ⟳            工作区 repo     dev·dev@x.cn  │  ← 分支/刷新/工作区名/Git 账号
└──────────────────────────────────────────────────┘
```

## 功能

- **Changes 区**（高度固定为面板一半，容器内滚动）
  - 提交信息输入框，右上角图标按钮调用**当前会话正在使用的模型**（取自会话日志最后一条 `request/header` 的 provider/model）生成描述并填入；`Ctrl+Enter` 直接提交
  - 提交按钮 + 右侧下拉：`提交` / `提交(修改)`（`--amend`）/ `提交和推送` / `提交和同步`（提交 → 拉取 → 推送），选择即切换按钮绑定；切到 `提交(修改)` 且输入框为空时自动预填上一条提交信息
  - 变更文件列表：`已暂存` 与 `更改` 两组，每行显示状态字母（M/A/D/U，冲突显示 `!`）、文件名、目录路径；组头可一键全部暂存/取消暂存
  - 行内操作：悬停出现 `+`（暂存）/ `−`（取消暂存）与 `⟲`（丢弃改动，需二次确认；未跟踪文件不给该入口）
  - **行内差异**：点击文件行就地展开该文件的工作区侧或索引侧差异，按增/删/上下文着色，再点一次或点右上角关闭
- **Graph 区**（内部滚动）
  - 泳道图：由父指针推导泳道与贯穿列，合并提交画空心节点
  - 每行：提交标题 + 短哈希/作者/相对时间 + 分支与标签徽标（当前分支高亮）
  - 工具栏：跳转到当前历史记录项（滚动到最新并高亮）、从所有远程存储库中抓取、拉取、推送、刷新
  - **提交详情**：点击提交行就地展开该提交的哈希、作者与时间、合并提交父数、以及改动文件清单（A/M/D/R）；再点文件行可就地展开**该提交内该文件的差异**
- **底部栏**（固定）：**分支切换器**（点击展开本地分支列表，勾选当前分支，点击即 `git checkout`；底部输入框可新建分支并切换，名称先过 `git check-ref-format`）、当前分支（含 ahead/behind）、刷新、当前工作区名称、Git 账号（`user.name · user.email`）
- **自动刷新**：订阅官方 `remote.workspaceFiles.changes` 会话文件变更流，写入后去抖 400 毫秒重读工作区状态（提交历史不重拉），展开中的差异同步刷新
- 顶部**没有**路径栏与搜索框（按要求精简）
- 只读读取与显式写操作分开：写操作只有暂存/取消暂存/丢弃/提交/推送/拉取/抓取/切换分支/新建分支

## 安装

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

## 开发（源码 link + 热替换）

```sh
node community/plugins/dev.mjs git-timeline     # junction 挂载 + Cordis HMR + watch 构建
cd community/plugins/packages/git-timeline
pnpm run build     # tsc + tsdown（host/client 双面）
pnpm test          # vitest（36 项）
```

注意：**改动 `src/remote.ts`（Remote 方法面）后必须重启 `dsh web`** —— typert-loader 按包名缓存插件 manifest 且永不过期，HMR 不会重新导入它；只改界面/文案时热替换即可。

## 宿主 Remote

`ctx.remote.gitPanel`（Typert，命名空间 `gitPanel`）：

| 方法 | 说明 |
|---|---|
| `status(cwd)` | 分支/上下游/ahead-behind + `staged[]` + `changes[]`（porcelain-v2 投影） |
| `log(cwd, limit?)` | 提交历史（含父提交，供泳道图使用），最多 400 条 |
| `diff(cwd, path, staged)` | 单文件差异（索引侧或工作区侧），上限 256 KB |
| `show(cwd, hash)` | 一条提交的元信息 + 改动文件清单（`diff-tree --name-status -z`） |
| `showFile(cwd, hash, path)` | 某条提交里某个文件的差异（`git show --patch`） |
| `branches(cwd)` | 本地分支名（按最近提交时间倒序） |
| `checkout(cwd, branch)` / `createBranch(cwd, name)` | 切换分支 / 新建并切换分支（名称先经 `check-ref-format` 校验） |
| `lastMessage(cwd)` | 上一条提交信息（`提交(修改)` 预填） |
| `discard(cwd, paths)` | 丢弃已跟踪路径的工作区改动（`git restore --worktree`） |
| `stage(cwd, paths)` / `unstage(cwd, paths)` | 按路径暂存 / 取消暂存 |
| `stageAll(cwd)` / `unstageAll(cwd)` | 全部暂存 / 取消暂存 |
| `commit(cwd, message, amend)` | 提交（`amend` 为真时 `--amend`），返回新短哈希 |
| `push(cwd)` / `pull(cwd)` / `fetch(cwd)` | 推送 / 拉取（`--no-edit`）/ 抓取全部远程并清理 |
| `identity(cwd)` | `user.name` / `user.email` |
| `message(sessionId, cwd)` | 用该会话的模型路由生成提交信息 |

所有命令经 `ctx.shell` 执行 git（普通 30 秒、网络类 120 秒超时）；可省参数在描述符里显式声明 `acceptsUndefined`。

## 提交信息生成的工作方式

1. 取会话最后一条 `request/header` 的 `config.provider/model`（即「当前会话使用的模型」）；没有记录时给出明确提示。
2. 组装输入：分支、改动文件清单、以及暂存侧（没有暂存则未暂存）的 diff（上限 24 KB，超出标注截断）。
3. 经 `ctx.llm.stream()` 发一次**一次性辅助请求**（`system` 要求简体中文、主题 ≤72 字符、必要时补要点），用 `BlockAssembler` 拼出文本回填输入框。

## 已知限制与后续工作

- 提交信息生成是插件侧的一次性辅助调用，**不写回会话转写**（与 UI 自身的摘要同级，不是 agent loop 的请求）。
- 丢弃改动只覆盖已跟踪路径；未跟踪文件不提供删除入口（避免误删尚未纳入版本控制的文件）。
- 提交详情只列改动文件，不内嵌该提交的差异（属后续工作）。
- 一次拉取历史上限 400 条；Graph 泳道绘制上限 5 列，超出归并展示。
- 多仓库工作区只服务当前会话工作区所属仓库。
