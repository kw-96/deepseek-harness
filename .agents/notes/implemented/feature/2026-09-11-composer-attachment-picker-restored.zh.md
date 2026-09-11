# Agent Note: 输入框恢复附件选择按钮

Status: implemented

[English](2026-09-11-composer-attachment-picker-restored.md) | 中文

## Problem

本地定制此前移除了输入框的附件按钮，只留粘贴与拖放两种接入方式。随后上游 0.1.5 的附件改造把选择器文案定为 `file.attach`（「添加附件」/「Add attachment」），并把接入能力扩展到通用文件——于是该词典键失去使用者，而输入框对自己已经能接收的文件没有选择器入口。用户要求恢复原生入口。

## Decision

工具栏的纸夹按钮与其隐藏的 `<input type="file" multiple>` 恢复，位置在指令按钮之后——升级后的 golden 已经携带该位置。选择器不设 `accept` 过滤，因为已发布的附件契约没有文件类型白名单；选中的文件进入与粘贴、拖放相同的 `intakeFiles` 流程——图片批次继续受投影限制约束，通用文件在选中时即开始后台上传。文案取自原生 `file.attach` 键，而不是已被移除的本地 `input.attachImage`，因为该入口现在同时覆盖图片与文件。按钮与拖放同步禁用：输入区锁定、附件服务缺失或子代理运行中；每次选择后清空 input 的 value，以便连续两次选择同一文件。

## Alternatives considered

**继续只用粘贴与拖放。** 否决：原生入口存在有其理由，而且在支持通用文件之后，选择器才是可发现的入口。

**沿用旧的本地 `input.attachImage` 文案。** 否决：「上传图片」/「Attach image」名不副实，该入口同样接受通用文件，而原生键已经拥有这段文案。

**为常见类型加 `accept` 白名单。** 否决：附件契约按字节原样保存任意文件，在选择器里做过滤会与能力相矛盾。

## Consequences

每次捕获 composer 的快照 golden 都会恢复一行「Add attachment」按钮。组件测试覆盖：选中图片与文件混合批次、输入区锁定时的禁用、子代理运行中与 `canAcceptDrop: false` 同步禁用，以及计划/目标进行中两种手势都保持可用。此前移除该按钮的 Note 已归档；粘贴与拖放行为不变。
