# Agent Note: 桌面标题栏的底部面板按钮改为驱动组合里的工作台

Status: implemented

[English](2026-09-15-desktop-bottom-toggle-targets-the-workbench.md) | 中文

## Problem

桌面标题栏的底部面板按钮切换的是框架自己的 `bottom` 轨道，而在实际发布的 Web 组合里那条轨道没有占用方：会话下沿属于外部底部工作台（`dsh-better-sidebar`），由该插件注册在会话头的一枚控件打开。于是两个控件做的是两件事——会话头那个打开工作台，标题栏那个打开一条空轨道。

## Decision

按钮先问组合。`ui-layout` 注入面里的 `toggleBottom` 报告自己是否处理了本次点击：找到占用方注册的 `[data-dsh-bottom-toggle]` 控件就点击它，找不到就返回「未处理」，由 `AppFrame` 打开或关闭本地 `bottom` 轨道。右侧面板按钮此前已按这条「组合优先」规则经 `sidebarRight.toggleExpanded` 生效；底部按钮现在与之对齐，查看菜单的 Ctrl+J 也走同一个回调。

## Alternatives considered

**读取工作台服务（`ctx.get('betterSidebar')`）。** 否决：该服务暴露的是标签页与文件查看器的注册面以及打开标签的能力，没有工作台开合，而且壳包不应依赖第三方插件包。

**为底部工作台定义一条 Cordis 服务契约。** 暂时否决：目前只有一个占用方，壳包会为此发明一个双方当前都不需要的接口。

**去掉标题栏这枚按钮。** 否决：桌面壳里用户看到下沿的唯一入口就是壳自身的 chrome，去掉它工作台就只剩会话头可达。

## Consequences

标题栏按钮与会话头开关现在驱动同一个工作台；组合里没有该占用方时，按钮保持原有的本地轨道行为。耦合面只是占用方控件上的一个 DOM 属性，属性消失则按钮静默回落，`ui-layout` 不保留对占用方包的依赖。控件自身状态仍是唯一事实来源：壳按钮既不读取也不渲染它。
