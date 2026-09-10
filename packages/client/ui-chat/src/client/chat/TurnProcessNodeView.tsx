import { memo } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNodeViewProps } from '../contract/slots.ts'
import css from './TurnProcessNodeView.module.css'

/** Turn-level process disclosure controller. */
export const TurnProcessNodeView = memo(function TurnProcessNodeView({
  node, turnProcess, t,
}: ChatNodeViewProps<'turn-process'>) {
  if (turnProcess === undefined) throw new Error('turn-process node requires Turn process owner state')
  if (!turnProcess.foldable) return null
  const open = turnProcess.open
  // While streaming, the disclosure counts the settled calls it folded (never
  // messages — a live answer stays visible); the closed Turn's spec carries
  // the full answer-boundary counts instead.
  const toolCallCount = turnProcess.streamingFold === true
    ? turnProcess.foldedToolCalls ?? 0
    : node.data.toolCallCount
  const subagentCount = turnProcess.streamingFold === true
    ? turnProcess.foldedSubagents ?? 0
    : node.data.subagentCount
  const messageCount = turnProcess.streamingFold === true ? 0 : node.data.messageCount
  const labels: string[] = []
  if (toolCallCount > 0) {
    labels.push(t(
      toolCallCount === 1
        ? 'message.turnProcess.toolCalls.one'
        : 'message.turnProcess.toolCalls.other',
      { count: toolCallCount },
    ))
  }
  if (messageCount > 0) {
    labels.push(t(
      messageCount === 1
        ? 'message.turnProcess.messages.one'
        : 'message.turnProcess.messages.other',
      { count: messageCount },
    ))
  }
  if (subagentCount > 0) {
    labels.push(t(
      subagentCount === 1
        ? 'message.turnProcess.subagents.one'
        : 'message.turnProcess.subagents.other',
      { count: subagentCount },
    ))
  }
  const label = labels.length === 0
    ? t('message.turnProcess.thoughtForAWhile')
    : labels.join(t('message.turnProcess.separator'))
  return (
    <button
      type="button"
      className={css.root}
      data-open={open || undefined}
      data-turn-process={node.data.turn}
      data-turn-process-messages={messageCount}
      data-turn-process-tool-calls={toolCallCount}
      data-turn-process-subagents={subagentCount}
      aria-expanded={open}
      onClick={(event) => {
        event.currentTarget.focus()
        turnProcess.setOpen(!open)
      }}
    >
      <span className={css.label}>{label}</span>
      <IconChevronDownOutline14 className={css.chevron} />
    </button>
  )
})
