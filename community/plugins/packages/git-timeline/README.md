# dsh-git-timeline

English | [中文](README.zh.md)

The official full Git panel tab in the DeepSeek Harness (DSH) right sidebar (`ui-sidebar-right`): changes and commits, a commit graph, remote sync, and commit-message drafting through the session's own model.

> The package keeps its historical name `dsh-git-timeline`; the panel itself has grown from a timeline into a full Git panel (tab label **Git**, tab kind `git`).

## Layout

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

## Features

- **Changes area** (fixed at half the panel height, scrolls inside its container)
  - Commit-message input; the icon button in its top-right corner calls the **model the current session is using** (the provider/model of the last `request/header` in the session log) to generate a description and fill it in; `Ctrl+Enter` commits directly
  - Commit button plus a drop-down to its right: `Commit` / `Commit (Amend)` (`--amend`) / `Commit and Push` / `Commit and Sync` (commit, then pull, then push); choosing one rebinds the button; switching to `Commit (Amend)` with an empty input prefills the previous commit message
  - Changed-file list in two groups, `Staged` and `Changes`; each row shows the status letter (M/A/D/U, `!` for conflicts), the file name, and the directory path; the group header stages or unstages everything in one click
  - Inline actions: hovering reveals `+` (stage) and `−` (unstage) plus `⟲` (discard changes, with a confirmation step; untracked files get no such entry point)
  - **Inline diff**: clicking a file row expands that file's worktree-side or index-side diff in place, colored by added, removed, and context lines; click the row again or use the close control in the top-right corner to collapse it
- **Graph area** (scrolls internally)
  - Lane graph: lanes and pass-through columns are derived from parent pointers; merge commits are drawn as hollow nodes
  - Each row: commit title, short hash, author, relative time, and branch and tag badges (the current branch is highlighted)
  - Toolbar: jump to the current history entry (scroll to the newest commit and highlight it), fetch from all remotes, pull, push, and refresh
  - **Commit details**: clicking a commit row expands that commit's hash, author and time, parent count for merges, and changed-file list (A/M/D/R) in place; clicking a file row then expands **that file's diff within the commit**, also in place
- **Git account**: clicking the account chip opens an inline editor (name, email, global or this-repository scope, Save); an unset identity reads “Set Git account” with a hint, and the chip tooltip names the config file the value comes from
- **Bottom bar** (fixed): the **branch switcher** (click to expand the local branch list, with the current branch checked; clicking a branch runs `git checkout`; the input at the bottom creates and switches to a new branch after its name passes `git check-ref-format`), the current branch (with ahead/behind), refresh, the current workspace name, and the Git account (`user.name` / `user.email`)
- **Automatic refresh**: subscribes to the official `remote.workspaceFiles.changes` session file-change stream and, 400 milliseconds after a write (debounced), re-reads the workspace status without re-fetching the commit history; diffs that are expanded refresh in step
- The top has **no** path bar or search box (trimmed as required)
- Read-only reads are kept separate from explicit write operations: the only write operations are stage, unstage, discard, commit, push, pull, fetch, switch branch, and create branch

## Install

```sh
dsh plugin --profile web add file:/path/to/community/plugins/tarballs/dsh-git-timeline-0.1.0.tgz
dsh plugin --profile web remove dsh-git-timeline
```

Or insert it manually into the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: git-timeline
      name: dsh-git-timeline
```

## Develop (source link + hot swap)

```sh
node community/plugins/dev.mjs git-timeline     # junction 挂载 + Cordis HMR + watch 构建
cd community/plugins/packages/git-timeline
pnpm run build     # tsc + tsdown（host/client 双面）
pnpm test          # vitest（36 项）
```

Note: **after changing `src/remote.ts` (the Remote method surface) you must restart `dsh web`**; typert-loader caches plugin manifests by package name and never expires them, so HMR does not re-import it. When you only change the interface or copy, hot swap is enough.

## Host Remote

`ctx.remote.gitPanel` (Typert, namespace `gitPanel`):

| Method | Description |
|---|---|
| `status(cwd)` | Branch, upstream, and ahead/behind plus `staged[]` and `changes[]` (a porcelain-v2 projection) |
| `log(cwd, limit?)` | Commit history (including parents, for the lane graph), at most 400 entries |
| `diff(cwd, path, staged)` | Single-file diff (index side or worktree side), capped at 256 KB |
| `show(cwd, hash)` | One commit's metadata plus its changed-file list (`diff-tree --name-status -z`) |
| `showFile(cwd, hash, path)` | The diff of one file within one commit (`git show --patch`) |
| `branches(cwd)` | Local branch names, most recent commit first |
| `checkout(cwd, branch)` / `createBranch(cwd, name)` | Switch branch / create and switch to a branch (the name is validated with `check-ref-format` first) |
| `lastMessage(cwd)` | The previous commit message (prefills `Commit (Amend)`) |
| `discard(cwd, paths)` | Discard worktree changes for tracked paths (`git restore --worktree`) |
| `stage(cwd, paths)` / `unstage(cwd, paths)` | Stage / unstage by path |
| `stageAll(cwd)` / `unstageAll(cwd)` | Stage / unstage everything |
| `commit(cwd, message, amend)` | Commit (`--amend` when `amend` is true); returns the new short hash |
| `push(cwd)` / `pull(cwd)` / `fetch(cwd)` | Push / pull (`--no-edit`) / fetch all remotes and prune |
| `identity(cwd)` | The signing identity plus the config file it comes from (`--show-origin`, falling back to `git var GIT_COMMITTER_IDENT`) |
| `setIdentity(cwd, name, email, scope)` | Write the signing identity (`global` writes the user config, `local` writes this repository only) |
| `message(sessionId, cwd)` | Generate a commit message with that session's model route |

Every command runs git through `ctx.shell` (a 30-second timeout normally, 120 seconds for network operations); optional parameters are declared explicitly with `acceptsUndefined` in the descriptor.

## How commit-message generation works

1. Read `config.provider/model` from the session's last `request/header` (that is, the model the current session is using); when there is no such record, show an explicit notice.
2. Assemble the input: the branch, the changed-file list, and the staged-side diff (the unstaged side when nothing is staged), capped at 24 KB and marked as truncated beyond that.
3. Send one **one-shot auxiliary request** through `ctx.llm.stream()` (the `system` prompt asks for Simplified Chinese, a subject of at most 72 characters, and bullet points when needed), then assemble the text with `BlockAssembler` and fill it back into the input box.

## Known Limitations and Deferred Work

- Commit-message generation is a one-shot auxiliary call made by the plugin, and it is **not written back to the session transcript** (it ranks alongside the UI's own summaries and is not an agent-loop request).
- Discarding changes covers tracked paths only; untracked files get no delete entry point, so files that are not yet under version control cannot be removed by mistake.
- Commit details list the changed files only and do not embed that commit's diff (matching the worktree diff view is deferred work).
- A single history fetch returns at most 400 entries; the Graph draws at most 5 lanes and merges anything beyond that into one.
- In a multi-repository workspace, only the repository that owns the current session workspace is served.
