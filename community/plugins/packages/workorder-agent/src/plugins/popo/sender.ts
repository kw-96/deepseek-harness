/** 发送单段文本时可选的补充参数。 */
export interface SendOptions {
  /** 本条消息的接收人；缺省使用发送器配置的默认接收人。 */
  receiver?: string
}

/** 文本发送器：机器人应用通道实现。 */
export interface MessageSender {
  /**
   * 发送单段文本。
   * @param message 消息正文
   * @param options 本条消息的接收人
   * @returns POPO 消息标识
   */
  sendText(message: string, options?: SendOptions): Promise<{ msgId: string }>
}
