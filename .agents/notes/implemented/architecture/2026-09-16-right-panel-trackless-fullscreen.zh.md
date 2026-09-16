# Agent Note: 无轨道的右栏改为全屏打开

Status: implemented

[English](2026-09-16-right-panel-trackless-fullscreen.md) | 中文

## Problem

视口宽度处于 768px 到 996px 之间时，右栏入口按钮是"死的"。`AppFrame` 解算列宽时中栏有 640px 下限、侧边栏从不让步，因此在低于 `CENTER_MIN + SIDEBAR_COLLAPSED + DETAILS_MIN`（996px）时 details 轨道解算为 0，框架上报 `canShow: false`。`SidebarRight` 自己的 `autoFullscreen` 只看视口（`< 768`），于是在 800px 下它会以 `push` 模式打开，随即被一个 layout effect 在同一 commit 内收起（`shown && !fullscreen && !canShow`）。用户看不到任何反应，也没有任何状态残留可供诊断。

这个区间不止影响窄桌面窗口：处于桌面模式的手机浏览器会上报约 980px 的视口，报告问题的那台设备正是如此。

## Decision

**拿不到轨道的面板覆盖视口，而不是把自己关掉。** `SidebarRight` 推导 `noTrack = viewportWidth < 768 || !canShow`，并取 `fullscreen = noTrack || surface.layout.mode === 'fullscreen'`。"打开即收起"的 layout effect 被删除：它守护的条件如今正是选择全屏的条件，因此不可能再成立。`track` 保持原义——`shown && !noTrack`——所以宽视口下的手动全屏仍上报保留轨道，用户在没有轨道处退出全屏时，模式按钮仍会关闭面板。

面板记录、标签页与其 signal 都不受这次切换影响：面板在缩放进、出无轨道区间时保持打开，用户自己做的模式选择也永远不会被改写。

## Consequences

打开右栏总能得到面板：桌面模式的手机、窄桌面窗口、平板，入口按钮现在首次触摸即生效，以全屏呈现而非毫无反应。已经打开的面板在窗口收窄进入无轨道区间时不再消失，而是覆盖会话区，直到窗口重新宽到足以停靠它。

代价是 768px 至 996px 的窗口失去并排阅读：面板覆盖会话，而不是与会话共享宽度。这是为"按钮能用"有意付出的代价；该区间里的另一种选择是根本没有面板。

## Alternatives considered

**保留"收不下面板就关闭"，只修入口按钮。** 按钮无法打开框架拒绝放置的面板，这样做等于让该区间完全没有右栏。

**调低 `CENTER_MIN` 或 `DETAILS_MIN`，让更窄的轨道也能放下。** 两者都是会话可读性的下限：降低它们只是把"没有面板"换成"面板加被压扁的会话"，而且桌面模式手机（980px）在任何仍能保证会话可读的下限之上依旧会命中。

**把右栏全屏的手机断点直接放大到 996px。** 那会把面板呈现绑死在一个由三个列常量推导出来的数字上；读取 `canShow` 让判断留在真正要紧的属性上——轨道是否存在。
