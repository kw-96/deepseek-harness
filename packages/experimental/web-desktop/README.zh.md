---
description: "实验性 Tauri 桌面壳：在独立原生窗口中打开 DeepSeek Harness Web。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-experimental-web-desktop`

[English](README.md) | 中文

## 概述

这是一个以 Windows 为先的私有 Tauri 壳：无控制台窗口拉起 `dsh web`，先显示启动页，待带鉴权的 `dsh web: http://…` 就绪行到达后导航 WebView2。它还会看护后端：后端退出即自动重启，窗口自行重连；连续 3 次启动失败则携带真实原因放弃重启，而不是只报超时。仓库跟踪根目录 `DeepSeek Harness.exe`。壳本身不挂载 Cordis；Node 应用仍只通过 `dsh` CLI 与 `web` profile 启动（[应用启动](../../../docs/architecture.zh.md#application-launch)）。关闭按钮只把窗口隐藏到托盘，`dsh web` 继续在后台服务。

## 目录

- [前置条件](#prerequisites)
- [使用本包](#use-this-package)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

-----

<a id="prerequisites"></a>
## 前置条件

- **对端主机（只运行）：** 带 WebView2 的 Windows；checkout 含根目录 `dsh.cmd`、已跟踪的 `.runtime/node-v24*`、`DeepSeek Harness.exe`，以及已构建的 Web 产物 `apps/web/dist`
- **维护者（重建壳）：** Rust stable 与 Windows MSVC 链接器

-----

<a id="use-this-package"></a>
## 使用本包

**任意 Windows checkout 在 `git clone` / `git pull` 之后：** 双击仓库根目录的 `DeepSeek Harness.exe`。exe 后的额外参数会转发到 `dsh web` 的 `--no-open` 之后。注意这些参数不会覆盖 profile 里 `webserver` 行的显式配置：本机 web profile 把 `port` 固定为 3080，传 `--port` 不会改变监听端口（实测仍会因 3080 被占用而失败）。

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

CLI 解析顺序：`DSH_DESKTOP_CLI` → 自本 exe 向上查找 → 自进程 cwd 向上查找 → 自编译期 crate 路径向上查找 → `PATH` 上的裸 `dsh.cmd` / `dsh`。找到 checkout 内 CLI 时，以其目录为 spawn 工作目录。

### 启动看护

若 `dsh web` 在就绪行之前退出，等待会以退出状态和子进程输出末尾结束，让启动页报告真实原因——例如端口已被另一个 `dsh web` 占用——而不是只报超时。连续 3 次启动失败则带着同样的诊断放弃重启，而不是无限循环。

壳从不安装依赖、也不构建前端：它只拉起 `dsh web --no-open` 并导航到带鉴权的地址，由该服务提供已经构建好的 `apps/web/dist`。请先构建产物（`pnpm run build`，只重建前端可用 `pnpm run build:web`）并让 profile 已安装（`node community/seed.mjs`）；缺失时壳会直接报告服务自身的失败原因。

### 托盘

壳启动时安装托盘图标：标题栏关闭按钮、`Ctrl+W` 与 `Alt+F4` 都只把窗口隐藏到托盘，`dsh web` 继续在后台服务；左键单击图标把窗口恢复并置前。右键菜单列出当前工作区（由 Web 侧经 `set_desktop_tray` 下发，顺序与左栏一致）、「显示主窗口」与「退出」——点击某个工作区即显示窗口并进入该工作区的会话；「退出」（或 文件 → 退出，`Ctrl+Q`）结束 `dsh` 进程树并关闭外壳。

托盘文案来自 Web 侧的 locale 字典（`desktop.tray.*`、`desktop.menu.quit`）；在页面加载完成之前，壳显示内置的中文兜底文案。

壳是**单实例**的：重复双击 `DeepSeek Harness.exe` 不会再起第二个壳或第二个托盘图标，而是把已有窗口恢复出来（判定标识即 `tauri.conf.json` 里的 identifier；插件的第二实例在启动自己的 `dsh web` 之前就已退出）。

隐藏行为可用 `scripts/smoke-tray-hide.ps1` 验证（默认用 3080，可用 `-Port` 换一个空闲端口；脚本只按自己启动的进程树判定，同机上另有 dsh 实例也不会误判，并在结束前自行清理）：

```powershell
powershell -ExecutionPolicy Bypass -File packages/experimental/web-desktop/scripts/smoke-tray-hide.ps1 -Port 3199
```

脚本断言：单实例守卫（第二次启动立即退出，并把已有窗口叫回来）、关闭窗口后窗口隐藏而进程仍在（这一条同时说明托盘已经装好——托盘挂不上时壳会退回关闭即退出）、真实模式下 `dsh web` 仍在服务。加上 `-FakeCli` 可以只验证壳行为：脚本造一个假后端，不占端口、不碰 profile，因此在同机已有 dsh 实例运行时也能跑。

```powershell
powershell -ExecutionPolicy Bypass -File packages/experimental/web-desktop/scripts/smoke-tray-hide.ps1 -FakeCli -Port 3199
```

-----

<a id="dev-note"></a>
## 开发备注

Decision record: [experimental Web desktop shell](../../../.agents/notes/implemented/feature/2026-09-07-experimental-web-desktop-shell.zh.md); [Codex-style desktop title bar](../../../.agents/notes/implemented/feature/2026-09-07-codex-style-desktop-titlebar.zh.md); [desktop tray hide and workspace menu](../../../.agents/notes/implemented/feature/2026-09-16-desktop-tray-hide-and-workspace-menu.zh.md).

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
- **CI 不把 `tauri build` 当作门禁** — 在分配 Rust/WebView2 runner 之前，由本地或可选任务负责原生编译。
- **已提交的 exe 可能过期** — 改了壳源码却未再跑 `pnpm run desktop:web` 并提交新的 `DeepSeek Harness.exe` 时，对端仍会用旧二进制。
- **exe 文件图标不能随主题变色** — Windows 资源管理器不会按系统浅色/深色重绘 PE 图标；当前交付为深色底 + 白色小鱼，保证两主题都可读。
- **自定义顶栏依赖 Tauri IPC** — 窗口关闭系统装饰后，启动页与 Web 顶栏通过 `withGlobalTauri` 与 remote capability 调用最小化/最大化/关闭；普通浏览器打开同一 Web 时不显示该顶栏。
- **关闭窗口不释放端口** — 关窗只是隐藏到托盘；要结束后端并释放端口，必须走托盘菜单的「退出」或 文件 → 退出。
- **后端重启不会重载窗口** — 壳只导航一次，恢复依赖 Web 客户端自身的重连循环；若该循环不再重试，窗口会一直停在重连提示，直到重载或重新启动。
