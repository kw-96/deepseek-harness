# Agent Note: Browser-agent session sweep isolation

Status: implemented

[English](2026-09-11-browser-agent-sweep-isolation.md) | 中文

## Problem

`dsh-browser-agent` 的周期巡检直接读 `ctx.agents` 来判断「宿主会话是否还存在」，但插件只声明了 `tools` 与 `subprocess` 两个注入。未声明的属性访问在 Cordis 里抛 `cannot get property "agents" without inject`；这个异常发生在定时器回调的 fire-and-forget 异步闭包内，没有任何环节接住它，于是成为未处理拒绝，在 Node 24 下直接终止整个 `dsh web` 进程。

后果比插件故障严重得多：后端是承载全部会话的进程。它一退出，已经打开的桌面窗口只会一直显示「自动重连中…」，直到有人手工重启 `dsh web`。排障时抓到的进程日志是 `dsh: fatal load failure: Error: cannot get property "agents" without inject`，栈顶为 `isOwnerAlive` 与 `BskSessionStore.reapOrphaned`。

该访问只在巡检真正遍历到会话记录时发生：没有记录时 `.filter` 不调用判定，插件看起来一切正常，所以缺陷在首次建立浏览器会话之后才以「后端随机掉线」的形式暴露。

## Decision

两处改动，分别针对失效的声明与不允许故障的调用面。

`BrowserAgent.inject` 补上 `agents`：这是巡检依赖的宿主会话查询服务，声明它才是合法的访问方式。

巡检改为经 `runSweep` 执行，它把孤儿回收与空闲回收包在 try/catch 中，失败只记录 `会话巡检失败：…`。周期巡检是后台维护面：宿主服务的一次异常或 bsk 命令的一次失败，都不应该终止承载用户会话的进程。

## Alternatives considered

**只在 `isOwnerAlive` 内部 try/catch。** 能让本次崩溃消失，但把接线错误吞成「判定永远为假」，孤儿回收静默失效；`runSweep` 的失败路径同时也覆盖 `sweepIdle` 与后续可能加入的维护动作。

**去掉孤儿回收，只留空闲回收兜底。** 会话 id 失效后没有任何调用能替它 `browser_stop`，孤儿 Agent Window 要一直留到空闲超时；这正是该巡检存在的理由。

**在进程级挂 `unhandledRejection` 处理器。** 会把每个插件的未处理拒绝都变成静默降级，连真正的致命错误也不再终止进程，等于用全局兜底掩盖局部缺陷。

## Testing

`tests/sweep.spec.ts` 覆盖三层：`runSweep` 在巡检抛错时保持 resolved 并记录原因；在真实 Cordis 组合里，宿主会话不存在时记录被回收（该路径必须经真实 `ctx.agents` 访问才能通过）；存活判定抛错时记录告警并保留记录，而不是让异常逃逸。`tests/composition.spec.ts` 断言 `inject` 声明了 `agents`，并为其提供 `agents` 服务替身。

## Consequences

巡检失败降级为一条警告，插件其余功能与宿主进程都不受影响。插件加载时开始等待 `agents` 服务——它本来就在读这个服务，只是之前没有声明。

## Deferred

同类缺陷的静态检测：仓库没有「插件访问的服务是否都在 `inject` 里声明」的检查，本次仍靠进程日志定位。把这类校验做成门禁是独立工作。
