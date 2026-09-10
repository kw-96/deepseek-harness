---
description: "实验性 Tauri 桌面壳：在独立原生窗口中打开 DeepSeek Harness Web。"
kind: "package-library"
---

# `@deepseek-ai/dsh-experimental-web-desktop`

[English](README.md) | 中文

## 摘要

这是一个以 Windows 为先的私有 Tauri 壳：无控制台窗口拉起 `dsh web --no-open`，先显示启动页，待带鉴权的 `dsh web: http://…` 就绪行到达后导航 WebView2。仓库跟踪根目录 `DeepSeek Harness.exe`，其他 Windows 主机 `git pull` 后即可双击使用。每次启动在需要时用 checkout 内 `.runtime` Node + corepack 执行 `pnpm install`（`node_modules` 缺失或旧于 `pnpm-lock.yaml`），并执行 `pnpm run build:web`（可用 `DSH_DESKTOP_SKIP_INSTALL` / `DSH_DESKTOP_SKIP_WEB_BUILD` 跳过），再快照 `apps/web/dist`（`DSH_WEB_DIST_INDEX`），使运行中会话不受后续重建影响。壳本身不挂载 Cordis；Node 应用仍只通过 `dsh` CLI 与 `web` profile 启动（[应用启动](../../../docs/architecture.zh.md#application-launch)）。

## 目录

- [前置条件](#prerequisites)
- [使用本包](#use-this-package)
- [开发备忘](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

-----

<a id="prerequisites"></a>
## 前置条件

- **对端主机（只运行）：** 带 WebView2 的 Windows；checkout 含根目录 `dsh.cmd`、已跟踪的 `.runtime/node-v24*` 与 `DeepSeek Harness.exe`；首次启动需要网络以完成 `pnpm install` / `build:web`
- **维护者（重建壳）：** Rust stable 与 Windows MSVC 链接器

-----

<a id="use-this-package"></a>
## 使用本包

**任意 Windows checkout 在 `git clone` / `git pull` 之后：** 双击仓库根目录的 `DeepSeek Harness.exe`。exe 后的额外参数会转发到 `dsh web` 的 `--no-open` 之后（例如 `--port 3080`）。

**改动本壳（Rust/UI）并准备推送时：** 重建并提交更新后的根目录 exe：

```sh
pnpm install
pnpm run desktop:web
git add "DeepSeek Harness.exe"
```

等价 filter 写法：`pnpm --filter @deepseek-ai/dsh-experimental-web-desktop build`。

若要从 `apps/web/public/favicon.svg` 刷新品牌图标：临时安装 `@resvg/resvg-js`，运行 `node scripts/rasterize-brand-icon.mjs`，再执行 `pnpm exec tauri icon src-tauri/icons/icon.png`，最后 `pnpm run desktop:web`。脚本会生成**深色圆角底 + 白色小鱼**：Windows 的 `.exe` 文件图标无法像网页 SVG 那样随系统浅色/深色主题自动切换黑白，双主题可读的实体图标是可行方案。若资源管理器对 `DeepSeek Harness.exe` 仍显示旧蓝标，先关闭该文件夹窗口，或注销/重启资源管理器以清掉按路径缓存的图标。

开发循环（热重建，不复制到根目录）：

```sh
pnpm --filter @deepseek-ai/dsh-experimental-web-desktop dev
```

CLI 解析顺序：`DSH_DESKTOP_CLI` → 自本 exe 向上查找 → 自进程 cwd 向上查找 → 自编译期 crate 路径向上查找 → `PATH` 上的裸 `dsh.cmd` / `dsh`。找到 checkout 内 CLI 时，以其目录为 spawn 工作目录。依赖命令使用与 `dsh.cmd` 相同的 `.runtime` Node 目录。

-----

<a id="dev-note"></a>
## 开发备忘

Decision record: [experimental Web desktop shell](../../../.agents/notes/implemented/feature/2026-09-07-experimental-web-desktop-shell.zh.md); [Codex-style desktop title bar](../../../.agents/notes/implemented/feature/2026-09-07-codex-style-desktop-titlebar.zh.md).

-----

<a id="model-experience"></a>
## 模型体验

无。本包只是把既有 Web profile 开在原生窗口中，不注册任何面向模型的输入。

#### KV 缓存影响

无；壳既不组装也不发送提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **以 Windows 为先** — Linux / macOS 不在本实验壳的发布矩阵中；Tauri 树或许能编过，但 WebView2 打包与进程树清理以 Windows 验证为准。
- **不是正式启动器** — 本包保持 private，且不进入正式 release；产品侧仍应使用 `dsh web` 或 CodeMaker Hub 等外部宿主。
- **首次启动需要网络** — `pnpm install` / `build:web` 不能离线；之后在 lockfile 未新于 `node_modules/.modules.yaml` 时会跳过 install。
- **CI 不把 `tauri build` 当作门禁** — 在分配 Rust/WebView2 runner 之前，由本地或可选任务负责原生编译。
- **已提交的 exe 可能过期** — 改了壳源码却未再跑 `pnpm run desktop:web` 并提交新的 `DeepSeek Harness.exe` 时，对端仍会用旧二进制。
- **exe 文件图标不能随主题变色** — Windows 资源管理器不会按系统浅色/深色重绘 PE 图标；当前交付为深色底 + 白色小鱼，保证两主题都可读。
- **自定义顶栏依赖 Tauri IPC** — 窗口关闭系统装饰后，启动页与 Web 顶栏通过 `withGlobalTauri` 与 remote capability 调用最小化/最大化/关闭；普通浏览器打开同一 Web 时不显示该顶栏。
- **前端冻结仅针对 dist** — Host 仍经 checkout 的 `dsh`（源码）启动；仅 Web 资源树会按会话重建并快照。
