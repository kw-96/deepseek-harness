# Agent Note: 在仍可「加载更早」时收起已完成的 Chat 轮次

Status: implemented

[English](2026-09-07-web-turn-process-fold-with-partial-history.md) | 中文

## 问题

[Web 轮次过程折叠](../../archived/feature/2026-08-14-web-turn-process-folding.md) 在会话仍提供「加载更早」时一律禁用 Compact disclosure。长会话几乎总会保留该控件，因此即使偏好已是 `compact`、已加载轮次也已有最终正文，工具与推理也不会收起。用户会把设置当成失效。

## 决策

`ChatNodeSeat` 不再用 Session 的 `hasMore` 门控可折叠性。已关闭且拥有定稿正文边界的轮次，一旦其 `TurnProcessSpec` 与呈现就绪，就在已加载窗口内按 Compact 收起。「加载更早」仍负责翻页更早事件；前置进来的轮次在自身过程事实完整后收起。打开中的轮次、没有最终正文的轮次、Normal 模式与焦点保留，仍遵循原折叠决策中的规则。

## 曾考虑的替代方案

**在历史全部加载完之前保留 `hasMore` 门控。** 不采用：这会让 Compact 在它本该服务的长会话场景下几乎不起作用。

**仅折叠 `processStartSeq` 严格晚于已加载窗口头的轮次。** 不采用：过程成员资格已由窗口内组装好的 Chat Node 决定；额外 seq 比较会隐藏证据尚未加载、但可见正文与后续成员本可收纳的合格组，造成不一致。

## 后果

Compact 会在「加载更早」仍可见时收起合格的已加载轮次，长 Chat 会话无需先拉完整历史也能符合 Compact 偏好。前置更早分页时，新获得资格的组收起仍可能让读者上方高度重排。单元覆盖固定了 `hasMore: true` 时的折叠，以及「加载更早」前置后仍保持 `hasMore: true` 时的折叠。原折叠说明保留其余 disclosure 规则，并交叉链接到本门控变更。
