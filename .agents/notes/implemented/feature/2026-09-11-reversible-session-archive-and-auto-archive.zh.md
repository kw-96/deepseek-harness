# Agent Note: 会话归档可逆与侧栏自动归档

Status: implemented

[English](2026-09-11-reversible-session-archive-and-auto-archive.md) | 中文

## Problem

注册表级归档集合此前是**只写**的。`WorkspaceRegistry.archiveSession()` 把一个 id 追加进去，所有分组面随即隐藏该会话，但没有任何路径能把 id 取出来：workspace 包自己的文档就写着这条限制（“归档是单向的——尚无取消归档动作”），Remote 命名空间也没有对应方法。用户一旦归档错会话，或侧栏自动隐藏了某个会话，该行就从所有浏览器界面消失，只能手工改写持久化状态才能恢复。

消费侧在另一个方向上有对称缺口。codex-shell 侧栏只提供逐条手动归档，没人再打开的会话因此无限累积；而它已经渲染的「归档」桶行上没有任何动作——已归档会话看得见、恢复不了。

## Decision

归档集合改为**双向显示过滤器**。

**宿主侧。** `WorkspaceRegistry.unarchiveSession(sessionId)` 从 `archivedSessionIds` 中移除该 id；不在集合中的 id 不写盘直接返回。它刻意不做会话存在性检查：归档从未改动会话的工作区归属——`sessionIds` 仍持有该 id，因此恢复只是一次纯显示集合写入，会话回到原来的位置。`WorkspaceCommands.unarchiveSession` 包装它并返回完整归档集合（复用既有 `WorkspaceArchiveValue`），`@Remote('unarchiveSession')` 把它暴露为 `ctx.remote.workspace` 方法；`ClientWorkspaceModel.unarchiveSession` 与归档路径同样安装返回的集合。

**消费侧。** codex-shell 侧栏把新动词接到归档桶行的悬停动作（「恢复」），并加入自动归档：侧栏挂载期间先扫一次、此后每 30 分钟扫一次，把 `updatedAt` 早于阈值天数的会话归档。运行中会话、当前选中、空白占位、子代理子会话与已归档 id 都跳过。阈值存放在侧栏偏好仓（`autoArchiveDays`，默认 30 天，`0` 表示关闭），并在「项目」标题栏的整理菜单里以 关闭 / 7 / 14 / 30 / 90 天 提供。

## Alternatives considered

**把归档变成删除。** 不予采纳：归档集合刻意保留持久化日志与工作区槽位，是一层显示过滤；会话删除是另一项独立且尚不存在的能力，保留期语义不同。删除还会把“单向”问题从可逆变成永久。

**把自动归档放进宿主注册表。** 本步不予采纳：那需要在 workspace 域里新增定时器与配置面，而这里的归档策略属于已经拥有归档动作的侧栏浏览面。日后搬迁是插件上的一个 Config 字段，不是数据迁移。

**用重新 attach 会话的方式恢复。** 不予采纳：归档从未移除记账，重新 attach 会把该行挪到 `sessionIds` 最前，丢掉归档承诺保留的位置。

**只在宿主定时扫描自动归档。** 不予采纳：那会在无人浏览时持续写盘，而让功能安全的是取消归档 API 加归档桶；浏览器侧扫描把两半放在同一处，GUI 关闭时不触碰持久化状态。

## Consequences

- 归档可逆：持久化集合、归档桶与恢复动作三者一致，且不改动工作区记账与会话日志。
- 自动归档可关可调，且只会作用于既非运行中、也非当前选中的会话；空闲机器上的会话要等下次打开侧栏才会被清理，这是不引入宿主定时器的既定代价。
- `WorkspaceArchiveValue` 现在同时服务两个方向，因此读取完整集合的消费者不需要新类型或新的排序规则。
- Remote 面在 `ctx.remote.workspace` 上多了一个方法，属于**宿主侧改动**：typert manifest 按包缓存，已在运行的 `dsh web` 必须重启后该方法才存在。
- `packages/workspace/workspace/README.md` 不再声称归档单向，其成员关系说明也与代码对齐：`attachSession` 只校验会话存在，因此记录在其它目录的会话可以被记入任意工作区。
- 生成的目录已覆盖全部 fork 增量：`codexImport` 及其两个 Remote 值归类到新的 [Codex 会话导入](../../../../docs/subsystems/session-import.zh.md)页，项目层类型（`Project`、`ProjectId`）、`TerminalFollowFrame` 与工作区请求类型族归入各自归属页，因此 `verify-cordis-catalog` 与 `verify-type-equiv` 均通过，公开的 Cordis 参考现已包含本方法、项目注册表面与 `SessionService.replace`。重生成[配置目录](../../../../docs/config-catalog.zh.md)同时补上了此前从未列出的 fork 包。

## Testing

- 注册表：归档的顺序持久化与幂等重复、恢复写进持久化记录且保留工作区槽位、重复取消归档与从未归档 id 的静默空操作。
- 控制器：`unarchiveSession` 对已归档 id 与集合外 id 都返回完整集合。
- 客户端模型：恢复失败时已安装集合保持不变，成功时安装返回集合并发出 `unarchiveSession` 调用。
- 侧栏：偏好阈值默认值与归一化（负数、小数）、整理菜单阈值项派发所选天数、归档行恢复动作触发回调。
