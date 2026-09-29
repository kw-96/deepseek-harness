# 运营下单规范

用于运营新建工单的语义复核。当前仅 dry-run，不允许直接发送 POPO。

输出必须包含：`passed`、`violations`、`evidence`、`confidence`。
低置信度结果仅进入人工复核，不得自动提醒。
