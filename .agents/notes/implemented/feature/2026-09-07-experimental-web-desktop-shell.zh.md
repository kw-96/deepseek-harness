# Agent Note: 实验性 Web 桌面壳

Status: implemented

[English](2026-09-07-experimental-web-desktop-shell.md) | 中文

## 问题

用户若想要类似 CodeMaker Hub 的独立窗口访问 DeepSeek Harness Web，只能依赖系统浏览器或外部宿主。仓库内没有既提供原生窗口、又仍遵守 `dsh` profile 应用启动规则的第一方壳；被 gitignore 的 exe 也无法在对端 `git pull` 后双击使用。

## 决策

`@deepseek-ai/dsh-experimental-web-desktop` 是位于 `packages/experimental/web-desktop` 的私有 Tauri 2 壳。在 Windows 上构建二进制并复制到仓库根目录为**已跟踪**的 `DeepSeek Harness.exe`（使用 DeepSeek favicon 作为应用图标）：以 `CREATE_NO_WINDOW` 拉起 `dsh web --no-open`，先显示启动页，等待 `@deepseek-ai/dsh-web-app` 打印的带鉴权 `dsh web: http://…` 就绪行后导航 WebView2，并在退出时结束 `dsh` 进程树。每次启动在 `node_modules` 缺失或旧于 `pnpm-lock.yaml` 时，经 checkout 的 `.runtime` Node + `corepack pnpm@11.7.0` 执行 `pnpm install`（可用 `DSH_DESKTOP_SKIP_INSTALL` 跳过），再以同样方式执行 `pnpm run build:web`（可用 `DSH_DESKTOP_SKIP_WEB_BUILD` 跳过），快照 `apps/web/dist` 并设置 `DSH_WEB_DIST_INDEX`，使运行中会话忽略后续前端重建。壳从不挂载 Cordis，也不绕过 `dsh`。CLI 解析顺序为 `DSH_DESKTOP_CLI`，再自运行中的 exe / 进程 cwd / 编译期 crate 路径向上查找，最后是 `PATH`。因 release 二进制无控制台，启动失败会弹出 Windows 消息框。exe 后的额外参数转发到 `dsh web` 的 `--no-open` 之后。

## 曾考虑的替代方案

**由 `dsh web` 做 Chromium `--app=URL` 交接。** 不采用：本次需求明确要求桌面壳与 exe 入口，而不是浏览器应用模式开关。

**作为 `apps/` 下的正式应用发布。** 首版不采用：该壳仍是原型，依赖原生工具链且无 CI 门禁，因此留在实验组，直到有稳定 owner 与 runner。

**把 Web 前端打进 exe。** 不采用：产品 UI 仍由托管的 `dsh web` dist 提供；内嵌会分叉鉴权、资源与发布打包。

**首次启动从 GitHub Release 下载 exe。** 本轮不采用：对端本就会拉取含 `.runtime` Node 的 monorepo；跟踪约 3MB 的根目录 exe，使双击留在 `git pull` 内，无需第二分发通道。

## 后果

对端 Windows 主机 `git pull` 后双击仓库根目录已跟踪的 `DeepSeek Harness.exe`。维护者改动壳后需再跑 `pnpm run desktop:web` 并提交新 exe。正式 release 与 `verify-application-entrypoints` 仍只承认 `dsh` profile 为 Node 应用启动器；本包不新增 Node `bin`。在分配合适 runner 之前，主 CI 不编译该 Rust 目标。
