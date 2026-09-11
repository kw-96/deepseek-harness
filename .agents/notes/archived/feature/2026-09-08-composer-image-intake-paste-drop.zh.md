# Agent Note: 输入区图片入口仅保留粘贴与拖放

Status: implemented
Archived: 2026-09-11

[English](2026-09-08-composer-image-intake-paste-drop.md) | 中文

## Problem

输入区工具栏带有一个回形针按钮，点击后打开隐藏的文件选择器用于图片接入。Codex 式入口不需要按钮：粘贴剪贴板图片与把文件拖到页面上已经覆盖相同手势。用户还遇到过加载到旧版客户端 bundle 的页面——粘贴图片后毫无反应，看起来像「不支持粘贴」，而实际上构建产物早已把剪贴板文件接入图片 intake 流程。

## Decision

移除回形针按钮及其隐藏的 `<input type="file">`，图片入口只剩粘贴与拖放。剪贴板文件本就会由输入区 keymap 的 `PASTE_COMMAND` 处理器（CRITICAL 优先级）收集并转发进与回形针共用的 `intakeImages` 流程，拖放则经 `conversation.input.attachments` 槽位进入同一流程，因此 intake 逻辑本身没有改动。本次修改只删除工具栏入口、不再使用的 `input.attachImage` 语言键，以及覆盖该按钮的两个组件测试。

## Alternatives considered

**保留按钮作为第三种手势。** 否决：用户明确要求对齐 Codex，且文件选择器与粘贴、拖放重复。

**只删可见按钮、保留隐藏 input。** 否决：按钮消失后，只能靠程序化点击触发的选择器是死代码。

**附件服务缺失时条件显示按钮。** 否决：在已发布的 web 组合中每个会话都有 `addImages`，该条件分支是不可达的界面。

## Consequences

工具栏现在只剩指令按钮，55 份快照 golden 删除了 Attach-image 按钮行。粘贴与拖放行为不变，仍由现有组件 spec 与 `queue-image`、`image-display` e2e 场景覆盖。用户只能通过粘贴图片到输入区或拖放图片到页面来添加图片。
