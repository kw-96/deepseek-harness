# Agent Note: 桌面顶栏三处体验修正

Status: implemented

[English](2026-09-08-desktop-titlebar-ux-fixes.md) | 中文

## 问题

Codex 式桌面顶栏上线后暴露三处体验问题：图标与菜单文字偏小；菜单展开后点击顶栏空白处不会自动收起（只有点击顶栏之外才收起）；最大化按钮不随窗口状态切换图标与语义标签。

## 决策

- **尺寸放大**：顶栏高度 36→40 像素，图标按钮 28→32 像素，面板 / 后退 / 前进图标 16/14→18/16 像素，窗口按钮图标 10→12 像素，菜单文字 13→14 像素；窗口按钮高度改由顶栏拉伸决定。
- **空白处收起**：菜单展开时，`pointerdown` 落在已打开的下拉面板或任一菜单按钮上保持或切换状态，落在顶栏其余区域（含拖拽区空白）则收起；拖拽区在菜单展开时先收起菜单、不启动 `startDragging`，符合 Windows 惯例。
- **最大化状态**：扩展 `DesktopAppWindow` 窗面（`isMaximized`、可选 `onResized`），挂载时读取一次并在 resize 事件后重新读取，同步 `maximized` 状态；按钮在最大化 / 还原之间切换图标与 `aria-label`，新增 locale 键 `desktop.window.restore`。`getCurrentWindow()` 每次调用返回新代理，组件改用 `useMemo` 稳定该引用供 effect 依赖。

## 曾考虑的替代方案

**仅监听顶栏外点击来收起菜单。** 现状即如此，用户反馈已否决。

**点击后直接翻转本地状态、不订阅 resize。** 不采用：双击拖拽区、外部方式改变窗口大小时按钮会失真。

## 后果

标题栏高 40 像素；`DesktopTitleBar` 依赖的窗面接口新增两个方法（`onResized` 可选，浏览器与旧壳下安全回退）。测试新增 `desktop-title-bar.client.spec.tsx`，覆盖菜单在顶栏内外的开合行为与最大化状态同步。
