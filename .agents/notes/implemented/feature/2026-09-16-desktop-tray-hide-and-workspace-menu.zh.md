# Agent Note: 桌面壳改为隐藏到托盘而不是退出

Status: implemented

[English](2026-09-16-desktop-tray-hide-and-workspace-menu.md) | 中文

## 问题

关闭就是退出。标题栏关闭按钮、`Ctrl+W` 与 `Alt+F4` 都会进到壳的 `CloseRequested` 处理器，那里会结束 `dsh web` 并让进程退出。只想把窗口挪开的桌面用户会连运行中的 harness 一起丢掉：会话不再可达，除了重新启动没有别的回程，也没有任何不经窗口进入某个工作区的入口。

## 决策

主窗口不再结束进程。壳在启动时挂上托盘图标（`src-tauri/src/tray.rs`），用 `api.prevent_close()` 加 `Window::hide` 回应 `WindowEvent::CloseRequested`，让 `dsh web` 继续在后台服务；左键单击图标恢复并聚焦窗口。退出改为显式动作：托盘菜单的「退出」或 文件 → 退出（`Ctrl+Q`）调用 `quit_desktop_app` 命令，结束 `dsh` 进程树并退出。

托盘菜单承载工作区。`ui-layout` 的 apply 世界经 `ctx.inject(['workspaces'])` 订阅工作区列表，把 `{id, title}` 条目与本地化文案通过 `set_desktop_tray` 命令下发，并在工作区或语言变化时重建菜单。选中某个工作区条目会显示窗口并发 `tray-open-workspace`；页面把它转成 `uiWorkspace.openWorkspace(id)`，于是这次点击落在该工作区的会话里。菜单文案来自客户端 locale 字典（`desktop.tray.*`、`desktop.menu.quit`）；壳只为「进程已启动、页面尚未加载」这段窗口期保留中文兜底。

一个托盘图标对应一个壳：`tauri-plugin-single-instance` 排在第一位注册，于是重复启动 `DeepSeek Harness.exe` 会在插件初始化阶段就退出——早于本应用的 setup，因此既不会拉后端也不会挂托盘——并在此之前请正在运行的壳把窗口显示出来。判定标识取自 `tauri.conf.json` 的 identifier。

## 曾考虑的替代方案

**由 Web 前端持有托盘。** 不采用：托盘必须在 WebView 到达 harness 地址之前就存在——启动页同样要能关闭到托盘——而窗口与进程生命周期始终由壳独占。

**由 Rust 直接读工作区注册表。** 不采用：工作区是客户端服务背后的 Host 业务数据，含顺序与归档规则；为一个菜单在 Rust 里分叉这套模型不划算。

**在标题栏关闭按钮上做原生右键菜单。** 不采用：需求没要，且托盘的菜单项才是指定的入口。

**自己写互斥体守卫。** 不采用：官方插件已经覆盖 Windows 命名互斥体、携带重复启动 argv 的 `WM_COPYDATA` 交接，以及早于本应用 setup 的退出点。

## 后果

关闭窗口会保留端口与运行中的会话；只有「退出」释放它们，`scripts/smoke-tray-hide.ps1` 正是断言这条分界（窗口隐藏、exe 存活、端口仍在服务，随后由脚本结束进程树）。同一个脚本还断言单实例守卫：第二次启动会退出，而第一个壳继续运行。自行退出的 harness 仍会在可能已隐藏的窗口下自动重启，因此托盘图标成了后端仍在运行的唯一可见信号。若托盘装不上（图标解码失败或系统托盘不可用），壳会记一行启动日志，关闭按钮保持此前的「结束应用」行为——把窗口藏起来却没有恢复入口，会把进程留在无法操作的状态。
