# Agent Note: 替换终结失败的 Session control stream

Status: implemented

[English](2026-09-15-session-control-stream-replacement.md) | 中文

## Problem

Host 范围的 Session control stream 是浏览器获得每个 Session 瞬态状态的唯一来源：queue 镜像、会话头任务列表背后的后台任务镜像，以及对话读取的每一个 projection。它的载体——`RemoteSnapshotStream` 之下的 Gateway `RemoteStream`——会自行重试物理 generation，但**终结结果**会让消费者到此为止：协议违规（opening snapshot 之前出现 update、出现第二个 opening snapshot），或 Host 仍可达时连续两次载体失败。Client 插件的 `failed` 出口只往控制台写了一行。

冻结的镜像读起来不像故障。会话头不再显示后台任务，排队消息不再出现，projection 不再推进，整个标签页看起来是空闲的。也没有东西能让 stream 复活：消费者的迭代已经结束，而这个结束会中止 stream 的生存期，此后再没有帧能到达它。唯一的恢复手段是手动刷新页面，那会重建整个 Client 运行时。

本部署正是这样撞上的：长时间打开的标签页经历一次 Host 重启后，会话头一直是空的，尽管 `ctx.jobs` 里有该会话的任务；只有刷新才把那些行带回来。

## Decision

Client Session 插件拥有 control stream 的各代 generation。`apply` 通过 `openControl()` 一次只开一代；当在世 stream 报告终结失败时，插件记录日志、dispose 失败的 stream，并在延迟之后开启后继者。延迟从一秒开始，按连续失败翻倍，上限三十秒；一旦 baseline 被接受就恢复基础延迟，因此恢复正常的 Host 会在一秒内收敛，而持续拒绝该 stream 的 Host 只以受限频率被重试。

只有在世 stream 会为自己安排后继者（`failed` 出口里的 `control !== stream`），因此替换者绝不会被替换两次。

`connection/reset` 重启在世 generation，而不是只重建 Session 列表。新的 Host generation 会重新发布每一份 baseline，因此镜像被替换，而不是继续描述刚刚结束的那一代。

销毁仍然挂在插件 fiber 的 effect 上：它取消待执行的替换定时器、dispose 在世 stream，并让迟到的定时器回调变成空操作。

## Consequences

标签页无需刷新即可重新收敛：只要替换后的 baseline 到达，会话头任务列表、queue 与 projection 就恢复更新。

终结失败仍然可见。每一次都会记录日志；改变的是那一行之后发生什么，而不是它是否出现。

恢复是整体替换。替换者的 baseline 会替换整个镜像，因此不会有半途应用的帧残留，恢复后的标签页展示的是 Host 的当前状态而不是两份状态的合并。

永久无法接受的 stream——例如某个 Client 构建的生成帧 codec 与 Host 不再匹配——现在会以延迟上限持续重试，而不是永久死亡，它的控制台行也会以该频率重复，直到页面被刷新。

## Alternatives considered

**在领域模型里发布失败阶段**，即 `ClientWorkspaceModel.handleStreamFailure` 采用的形式：stream 失败变成 `state: 'error'`。否决，因为 Session control 镜像没有错误座席：它喂给的是槽位级 hook（`useSessions`、`useProjection`），而它们的消费者没有错误分支；冻结的镜像本来也与空闲的 Session 无法区分，因此没人渲染的错误状态不会改变任何可观察行为。

**把重试放进 Gateway `RemoteStream`**，而不是领域所有者。否决，因为它那次「Host 仍可达时的一次隔离重试」预算是刻意的——它把物理载体丢失与业务、协议失败分开——而协议违规不会因为在传输层重复而修复。必须保持收敛的领域自己拥有它的替换。

**终结失败时刷新页面。** 否决，因为它为了恢复一条 stream，丢掉页面拥有的一切——输入框草稿、未发送附件、滚动位置、面板状态。

**失败后轮询 control 状态。** 否决，因为完整 baseline 帧已经存在；为一个替换 baseline 就能回答的场景新增轮询动词，只会增加线路面。

## Testing

`packages/api/session-controller/tests/client-apply.client.spec.ts` 用可编程的 Host fake 驱动整条路径：协议违规（第二个 opening snapshot）终结该 generation，延迟到期之前没有 baseline 到达，到期之后到达一份，而销毁插件 fiber 后不再产生 generation。同一文件里的终结失败用例继续钉住诊断本身。
