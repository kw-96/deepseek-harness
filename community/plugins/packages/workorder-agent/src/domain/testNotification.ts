/**
 * 生成固定测试通知文案；正文使用接收人本身，不做 @。
 * @param receiver 接收人（用户邮箱或群 ID）
 * @returns 测试消息正文
 */
export function buildTestNotification(receiver: string): { message: string } {
  const target = receiver.trim() || '相关同学'
  return {
    message: [
      '【设计工单填写提醒】',
      `${target}：`,
      '未填写总工时：[#49100](https://promoteart.pm.netease.com/v6/issues/49100)、[#49066](https://promoteart.pm.netease.com/v6/issues/49066)',
      '',
      '请相关同学及时完善工单字段。',
    ].join('\n'),
  }
}
