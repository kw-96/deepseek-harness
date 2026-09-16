# Agent Note: 带 hash 的 Web 产物按不可变资源缓存，部署压缩级别提到 6

Status: implemented

[English](2026-09-16-static-asset-cache-and-compression.md) | 中文

## Problem

Web 界面冷启动要拉一批约 5 MB（gzip 后）的插件 bundle 加上 Vite 产物。而 Vite 产物（`/assets/<名字>-<hash>.<扩展名>`）当时只带 `content-type` 响应头——没有 `Cache-Control`、没有 `ETag`、没有 `Last-Modified`——于是每次刷新都重新下载，尽管文件名里本来就带内容 hash。在远程链路上实测（走 Tailscale DERP 中继，往返约 450 毫秒）这次重复下载就是刷新开销的主体；而占 5 MB 大头的插件 bundle 路由早已按不可变资源缓存。

## Decision

`serveStatic` 只对匹配 `/assets/<名字>-<hash>.<扩展名>`（Vite 构建产物的命名）的路径追加 `Cache-Control: public, max-age=31536000, immutable`，其余路径一律不带缓存指令。插件 bundle 路由不动：`/plugins/<id>/client.js` 已经带 `rev` 查询且已发 `immutable`。

部署的 webserver 行把 `compressionLevel` 从 1 提到 6：同一份载荷体积更小，而是否压缩不变（压缩中间件早已跳过 `text/event-stream`）。

## Alternatives considered

**整个 dist 根目录都缓存。** 否决：`index.html` 是逐请求渲染的（插件注入行就在这一步跑），不带 hash 的文件也可能被原地改写；缓存任一都会把浏览器钉在旧壳上。

**给所有静态响应加 `ETag`／`Last-Modified`。** 本次否决：这需要两端都实现条件请求处理，而真正重要的那一类——带 hash 的产物——根本不需要重新验证。

**插件 bundle 路由也加长缓存。** 否决：那些路径的文件名里没有 hash，插件升级或卸载后会继续提供旧的客户端产物。

## Consequences

刷新不再重取 Vite 产物（约 440 KB gzip），冷启动在级别 6 下数据量更小。`index.html`、不带 hash 的文件与 `/plugins/*` 保持原行为，因此升级与插件变更在下次加载时依然生效。旧的 `assets/*` 文件只可能被旧的 `index.html` 请求，而它不缓存，所以正常升级从不需要用户清浏览器缓存。
