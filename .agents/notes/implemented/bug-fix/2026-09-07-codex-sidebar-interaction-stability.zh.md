# Agent Note: Codex 侧栏交互稳定性

Status: implemented

[English](2026-09-07-codex-sidebar-interaction-stability.md) | 中文

## Problem

Codex Shell 拥有替换工作区侧栏，普通列表交互不能依赖宿主浏览器实现。插件搜索让先前远端请求继续存活，选中行显示了原先未预留的时间槽，项目详情随指针悬停打开，菜单关闭依赖离开浮层。这些行为会产生过期搜索结果、标题宽度变化、意外覆盖层和只能用鼠标恢复的路径。

## Decision

插件侧栏对内容请求做防抖，取消前一请求，并且只接收最新完成。会话和项目行是可聚焦 tree item：Enter 或 Space 打开/开合，会话行用 Left/Right 开合子代理。时间和操作区始终预留空间，因此选中不会改变标题宽度。项目详情只通过显式信息按钮打开。上下文菜单在外部指针输入或 Escape 时关闭，并把起点限制在视口内。

## Alternatives considered

**保留仅悬停详情和菜单关闭。** 不采用：指针移动与意外悬停会使工作区导航不稳定。

**用 `display: none` 隐藏时间戳。** 不采用：改变 flex 参与度会在选中时改变标题宽度。

## Consequences

Codex Shell 侧栏继续兼容宿主会话搜索服务，同时增加插件本地取消与键盘行为。聚焦插件测试覆盖过期搜索取消和树行激活；真实 Web 运行仍是最终视觉验收的依据。
