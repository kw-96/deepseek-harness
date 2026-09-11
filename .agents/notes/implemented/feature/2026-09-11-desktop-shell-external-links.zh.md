# Agent Note: 桌面壳外链改用系统默认浏览器打开

Status: implemented

[English](2026-09-11-desktop-shell-external-links.md) | 中文

## Problem

桌面壳（Tauri）里点击 http(s) 链接没有任何反应。Markdown 锚点带 `target="_blank"`，而壳从不处理新窗口请求，Tauri 默认拒绝它；若是同窗口导航，又会用外部站点顶掉 harness 页面。壳此前完全没有外链出口——没有 opener 插件、没有导航钩子、也没有命令。

## Decision

壳只保留一个出口，分两条链路承接。Rust 新增 `external_links` 模块：`open_external` 命令接收前端转交的新窗口点击，`dsh-external-links` 插件的导航钩子兜住同窗口导航。两者都只接受 `http`/`https`，并把地址交给平台浏览器启动器（Windows `rundll32 url.dll,FileProtocolHandler`、macOS `open`、Linux `xdg-open`）；即使启动失败，导航钩子也拒绝该次导航，壳页面永远不会被外部站点替换。指向随包前端页面（`tauri.localhost`）、`127.0.0.1`/`localhost` 与 WebView 内部协议的请求留在壳内。

客户端一半放在 `ui-layout` 的桌面模块：`installExternalLinkHandler` 注册一个捕获阶段的点击监听，由仅在 Tauri 挂载的标题栏安装。它只对「普通左键、无修饰键、锚点协议为 http(s) 且 host 与页面不同」的点击阻止默认行为，然后调用 `open_external` 命令。浏览器标签页没有 Tauri 全局对象，该模块不安装任何东西。

## Alternatives considered

**引入 `tauri-plugin-opener`。** 否决：为一个平台调用新增 crate 依赖与 capability 装配，而壳本来就要启动进程，启动器每平台只有三行。

**把主窗口改为 `WebviewWindowBuilder` 创建，以获得 `on_navigation`/`on_new_window`。** 否决：窗口当前来自 `tauri.conf.json`，这会把每个窗口属性挪进 Rust 代码，而钩子只覆盖两条链路中的一条——`target="_blank"` 根本不经过 `on_navigation`。

**保留浏览器用的 `target="_blank"`，在 Tauri 下剥离它。** 否决：这会让 Markdown 渲染器感知环境，而且浏览器一侧对 `window.open` 形式的链接仍需要同样的点击拦截。

## Consequences

原生部分需要重建壳才生效（`pnpm --filter @deepseek-ai/dsh-experimental-web-desktop build` 会刷新仓库根目录的 `DeepSeek Harness.exe`）；客户端部分与其它 bundle 一样热替换。Web 模式行为不变。已带修饰键、同源或非 http(s) 的锚点保持原生行为。启动器打开失败时链接停留在页面上，不会让 WebView 导航离开。

启动页由 WebView2 的虚拟主机 `tauri.localhost` 提供，它必须被判定为壳内地址：漏判会让导航钩子拦掉壳自己的首页——窗口停在空白页（纯黑），同时把 `tauri.localhost` 甩给系统浏览器，而该主机只在 WebView 内部存在，浏览器必然显示无法访问。
