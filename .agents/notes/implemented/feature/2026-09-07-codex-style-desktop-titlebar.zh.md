# Agent Note: Codex 式桌面顶栏

Status: implemented

[English](2026-09-07-codex-style-desktop-titlebar.md) | 中文

## 问题

实验性 Tauri Web 桌面壳沿用 Windows 默认标题栏。该条带叠在 Web UI 之上，形成第二层窗口装饰，独立窗口无法像 Codex 那样读成一块连续界面。

## 决策

壳窗口设置 `decorations: false`（并开启 `shadow: true` 与 `withGlobalTauri: true`）。Capability ACL 向主窗口以及远程 `http://127.0.0.1:*` / `http://localhost:*` 授予最小化、切换最大化、开始拖拽、关闭与全屏权限，因为 WebView 最终导航到托管的 `dsh web` 源。

启动页提供薄拖拽区与三个窗口按钮，使无边框窗口在导航前仍可关闭。导航后，`@deepseek-ai/dsh-client-ui-layout` 仅在探测到 Tauri 全局对象时挂载 Codex 式整宽 `DesktopTitleBar`：最左为侧栏开关与会话后退/前进，随后是文件 / 编辑 / 视图菜单（无帮助），中间为拖拽区，右侧为 Windows 最小化 / 最大化 / 关闭。菜单项只接线已有 DSH 动作；Codex 特有面（临时聊天、注销、浏览器子菜单、审阅面板）省略而非占位。跨插件动作（新会话、设置、添加工作区）通过窗口 CustomEvent `dsh-desktop:command` 派发，使 ui-sidebar、ui-settings-general 与 `dsh-codex-shell` 可监听而无需新增 Cordis 边。桌面态展开侧栏隐藏 `logoRow` 中重复的折叠控件。

## 曾考虑的替代方案

**仅浮窗窗口按钮、无菜单栏。** 不采用：需求参考的 Codex 顶栏包含导航与文件/编辑/视图。

**把 chrome 放进 `dsh-codex-shell`。** 不采用：会话与面板插件不应拥有 OS 窗口控件；AppFrame 才是壳层帧的所有者。

**把 `@tauri-apps/api` 打进 Web 客户端。** 不采用：`withGlobalTauri` 已向启动页与远程 localhost 页面暴露所需窗口面。

## 后果

维护者改壳后需重建 `DeepSeek Harness.exe`。浏览器路径的 `dsh web` 不变。从文件菜单打开工作区需要监听 `dsh-desktop:command` 的 `dsh-codex-shell` 发布（0.6.2+）。

顶栏的尺寸、空白处收起与最大化状态同步在 [2026-09-08-desktop-titlebar-ux-fixes](2026-09-08-desktop-titlebar-ux-fixes.zh.md) 中修正。
