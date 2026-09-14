---
description: "Web 后台任务界面：列出本会话可见任务的会话头部动作；供后台任务体验的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-jobs

[English](README.md) | 中文

## 概述

本包渲染 Web GUI 的后台任务界面：一个会话头部动作，打开后以弹层列出本会话可见的任务。它经运行时提供的 `jobsBySession` 镜像读取宿主计算的注册表状态，自身只发一次 RPC：按操作者请求停止一个运行中的任务。触发器只在会话至少有一个任务时出现，角标计数运行中与停止中的任务；终态行保持可见并弱化，直到注册表把它们丢弃。模型对同一批任务的视角属于 `dsh-tool-jobs`；本包是给人类看的只读投影。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

与运行时一起挂载本插件；只要会话至少有一个任务，任务动作就会出现在会话头部。点击打开弹层：活跃行在前按开始时间升序，随后终态行按结束时间降序，每行显示生产者 kind、标签、状态，以及一个活跃时每秒跳动、完成后冻结的已耗时。

### 关闭与边界

Escape 关闭列表并把焦点交还触发器，在其外部按下指针同理。列表展示的是「一个会话通过协议视图能看到什么」，因此别的会话拥有的任务在这里永不出现；进程重启会清空列表，而 transcript（文本记录）里启动这些任务的 `run_in_background` 卡片仍在。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包向 `conversation.session.header.actions` 贡献一个条目（`JobListAction`），数据完全来自会话控制器绑定从 `session/jobs` 帧折叠出的 `jobsBySession` 列表镜像——唯一一次 RPC 是停止任务；除此之外只读取镜像，除弹层开合外不持有任何状态。运行中的行带一个「停止」控件：它调用 `session/killJob`——解析该会话的在世 Agent、套用所有会话命令共用的子代理归属拒绝，再请求注册表取消那一个任务；随后该行经由列表本来就镜像的注册表帧变成 `stopping` 并进入终态，无需重新拉取。被拒绝或未知的任务会让该行保持原样，且不弹提示：这个界面自身没有错误通道。拥有该任务的 Agent 还会收到一条注入的通知，因为注册表会把被取消任务的终态投递标为已上报，否则它会一直沉默。角标计数 `running` 加 `stopping`，为零时省略。行序为活跃行在前按 `startedAt` 升序、终态行按 `finishedAt` 降序，毫秒并列按启动顺序打破；缺少 `finishedAt` 的终态行读作零而不是负数，超过一小时的耗时停留在小时单位。终态行保持可见，因为失败任务的 `detail` 是其失败唯一可读之处。行为由 [Web 后台任务展示 Agent Note](../../../.agents/notes/implemented/feature/2026-08-08-web-background-job-display.zh.md) 规定，停止控件归 [从会话头停止单个后台任务](../../../.agents/notes/implemented/feature/2026-09-14-session-job-stop-control.zh.md) 所有。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当任务界面本身无法满足需要时，请阅读以下页面。它们从浏览器列表进入注册表与面向模型的工具。

- [dsh-tool-jobs](../../jobs/tool-jobs/README.zh.md)——同一注册表之上的面向模型任务工具。
- [会话控制器](../../api/session-controller/README.zh.md)——折叠出本包读取的 `jobsBySession` 镜像。
- [ui-subagent](../ui-subagent/README.zh.md)——subagent 目录，运行中的一次性后台 subagent 也会出现在那里。
- [Web 客户端架构](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——浏览器插件行如何加载并注册 slot。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包为人类渲染宿主计算出的注册表状态，不触及提示词、消息、schema、流或工具结果。

#### KV Cache 影响

无；本包从不组装或发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了当前任务列表。它们是当前包约束，不是通用任务管理对比或任务积压。

- **停掉任务不等于停掉回合** —— 该控件只结束一个后台任务；回合、队列与会话记录都不受影响，而无视取消信号的生产者会一直报告 `stopping` 直到它结束。
- **列表不等于注册表自己的集合**——它展示的是一个会话通过协议视图能看到什么，因此别的会话拥有的任务在这里永不出现；进程重启会清空列表，而 transcript 里启动这些任务的 `run_in_background` 卡片仍在。无主任务（没有活体 `Agent` 时启动的）反过来会进入每个会话的列表，与 `list(caller)` 对每个调用方的报告一致。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。本包只是将 `jobsBySession` 镜像投影为一个会话头部 slot 条目（可读，且能停止单个运行中的任务），不发出 Cordis 事件，也不持有跨插件可变状态；其唯一的 slot 注册通过 HMR（热模块替换）安全性规范验证了资源释放行为。
