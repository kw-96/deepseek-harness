/** 会话历史的 Markdown 导出：尽力拼装用户/助手文本，失败返回 null。 */

interface SessionHistoryValueLike {
  records?: readonly unknown[]
}

export interface ConnectionProbeLike {
  api?: {
    sessions?: {
      history?: (request: {
        sessionId: string
        maxMessages?: number
        beforeSeq?: number
      }) => Promise<{ ok: true; value: SessionHistoryValueLike } | { ok: false }>
    }
  }
}

/**
 * 尽力导出会话用户/助手文本为 Markdown。
 * @param connection - 客户端连接服务（结构面探测，缺失历史能力时返回 null）。
 * @param sessionId - 目标会话 id。
 * @returns Markdown 文本；无法拉取历史时返回 null。
 */
export async function exportSessionMarkdown(connection: unknown, sessionId: string): Promise<string | null> {
  const probe = connection as ConnectionProbeLike
  const history = probe.api?.sessions?.history
  if (history === undefined) return null
  try {
    const result = await history({ sessionId, maxMessages: 400 })
    if (!result.ok) return null
    const lines: string[] = []
    for (const record of result.value.records ?? []) {
      const event = record as {
        type?: string
        data?: { content?: readonly { type?: string; text?: string }[]; source?: { kind?: string } }
      }
      const text = (event.data?.content ?? [])
        .filter(block => block.type === 'text')
        .map(block => block.text ?? '')
        .join('')
        .trim()
      if (text === '') continue
      if (event.type === 'user/message') lines.push(`## User\n\n${text}`)
      else if (event.type === 'assistant/message' || event.type === 'model/message') {
        lines.push(`## Assistant\n\n${text}`)
      }
    }
    return lines.length === 0 ? null : lines.join('\n\n')
  } catch {
    // 历史读取失败只影响导出：返回 null 让菜单项保持不可用语义。
    return null
  }
}
